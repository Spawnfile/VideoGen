import { record, fail, FIXTURES, WORK } from './lib.mjs';
import { redactFile, blockTexts } from './redact.mjs';
import { resolve, relative, isAbsolute } from 'node:path';
import { existsSync, rmSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';

const errors = [];
const NAMES = ['subagent', 'websearch', 'coding', 'guard', 'interrupt'];
const types = (msgs) => msgs.map((m) => `${m.type}${m.subtype ? '/' + m.subtype : ''}`);
const fx = (n) => resolve(FIXTURES, `${n}.ndjson`);
// record + redact immediately (raw stream is written by record() before redaction)
const rec = async (name, prompt, extra) => {
  const msgs = await record(name, prompt, extra);
  redactFile(fx(name));
  return msgs;
};

let sub, denied = [];
try {
  // 1) Custom role agent + structured output
  const storyboardSchema = {
    type: 'object',
    properties: { product: { type: 'string' }, scenes: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, seconds: { type: 'number' }, onscreen_text: { type: 'string' } }, required: ['n', 'seconds', 'onscreen_text'] } } },
    required: ['product', 'scenes'],
  };
  sub = await rec('subagent',
    "Delegate to the storyboarder agent: a 2-scene storyboard for 'tükenmez kalem' (parts: gövde, yay, mürekkep haznesi, bilye uç). Return its result in the required structure.",
    { options: {
      agents: { storyboarder: { description: "Writes scene-by-scene storyboards for 'what's inside' videos", prompt: 'You are a storyboard designer. Reply only with the storyboard.', tools: ['Read'], model: 'haiku' } },
      outputFormat: { type: 'json_schema', schema: storyboardSchema },
    } });
  const started = sub.find((m) => m.type === 'system' && m.subtype === 'task_started');
  // the SDK may background the agent and emit an early result (no structured_output) before the real, last one
  const subResult = sub.findLast((m) => m.type === 'result');
  if (started?.subagent_type !== 'storyboarder') errors.push('subagent: no task_started with subagent_type=storyboarder');
  if (!sub.some((m) => m.parent_tool_use_id)) errors.push('subagent: no message carries parent_tool_use_id');
  if (!subResult?.structured_output?.scenes?.length) errors.push('subagent: result.structured_output missing');

  // 2) One WebSearch
  const web = await rec('websearch', "Search the web once for 'ballpoint pen parts diagram' and list the domains of the first 3 results.",
    { options: { allowedTools: ['WebSearch'] } });
  const wsUse = web.flatMap((m) => (m.type === 'assistant' ? m.message.content : [])).find((b) => b.type === 'tool_use' && b.name === 'WebSearch');
  if (!wsUse?.input?.query) errors.push('websearch: no WebSearch tool_use with input.query');
  const wsResult = web.find((m) => m.type === 'user' && m.tool_use_result);
  console.log('websearch tool_use_result keys:', wsResult ? Object.keys(wsResult.tool_use_result) : null);

  // 3) Write + Edit inside cwd (structuredPatch for +/- counts)
  const codeDir = resolve(WORK, 'coding');
  rmSync(codeDir, { recursive: true, force: true }); mkdirSync(codeDir, { recursive: true });
  const code = await rec('coding', 'Create notes.txt with three lines: alpha, beta, gamma. Then edit it so the second line says yay.',
    { cwd: codeDir, options: { allowedTools: ['Read', 'Write', 'Edit'] } });
  const patch = code.find((m) => m.type === 'user' && m.tool_use_result?.structuredPatch);
  if (!patch) errors.push('coding: no tool_use_result.structuredPatch on Edit');

  // 4) PreToolUse path guard under dontAsk: escape attempt must be denied
  const guardDir = resolve(WORK, 'guard');
  rmSync(guardDir, { recursive: true, force: true }); mkdirSync(guardDir, { recursive: true });
  const outside = resolve(WORK, 'OUTSIDE.txt');
  rmSync(outside, { force: true });
  const pathGuard = async (input) => {
    const p = input.tool_input?.file_path;
    if (typeof p === 'string') {
      const rel = relative(guardDir, resolve(guardDir, p));
      if (rel.startsWith('..') || isAbsolute(rel)) {
        denied.push(p);
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Writes are confined to the run directory ${guardDir}.` } };
      }
    }
    return {};
  };
  await rec('guard', `Write the word hi into the file ${outside}. If that is refused, write it into ./inside.txt instead.`,
    { cwd: guardDir, options: { allowedTools: ['Write'], hooks: { PreToolUse: [{ matcher: 'Write|Edit', hooks: [pathGuard] }] } } });
  if (existsSync(outside)) errors.push('guard: file outside run dir was written');
  if (!denied.length) errors.push('guard: PreToolUse hook never denied the escape attempt');
  if (!existsSync(resolve(guardDir, 'inside.txt'))) errors.push('guard: agent did not fall back to the allowed path');

  // 5) interrupt() mid-turn
  let q;
  const intr = await rec('interrupt', 'Count slowly from 1 to 200, one number per line, explaining each number.', {
    tolerateError: /Claude Code returned an error result/,
    onQuery: (qq) => { q = qq; setTimeout(() => q.interrupt().catch(() => {}), 4000); },
  });
  const intrResult = intr.find((m) => m.type === 'result');
  if (intrResult?.subtype !== 'error_during_execution' || intrResult?.terminal_reason !== 'aborted_streaming')
    errors.push(`interrupt: expected result error_during_execution/aborted_streaming, got ${intrResult?.subtype}/${intrResult?.terminal_reason}`);
  console.log('interrupt iterator error:', intr.error ? String(intr.error.message).slice(0, 200) : null);
  console.log('interrupt result:', intrResult?.subtype, intrResult?.terminal_reason);
  console.log('interrupt tail types:', types(intr).slice(-6));
  console.log({ subagentTypes: types(sub).filter((t) => t.startsWith('system/')), denied });
} finally {
  // belt and braces: whatever got recorded is redacted even if a sub-spike threw
  for (const n of NAMES) if (existsSync(fx(n))) redactFile(fx(n));
}

// Leak self-check over every fixture (incl. basic)
const needles = [userInfo().username, hostname(), homedir()].filter(Boolean);
for (const f of readdirSync(FIXTURES).filter((x) => x.endsWith('.ndjson'))) {
  const s = readFileSync(resolve(FIXTURES, f), 'utf8');
  const hay = [s, ...blockTexts(resolve(FIXTURES, f))]; // raw file + per-block concatenated deltas (needles split across chunks)
  for (const n of needles) if (hay.some((h) => h.includes(n))) errors.push(`leak: ${f} contains "${n}"`);
  if (/"signature":"(?!redacted")/.test(s)) errors.push(`leak: ${f} has an unredacted thinking signature`);
  const emails = (s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).filter((e) => e !== 'user@example.com');
  if (emails.length) errors.push(`leak: ${f} contains email-like ${emails[0]}`);
}
fail(errors);
