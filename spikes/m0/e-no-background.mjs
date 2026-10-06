// M0 Task 8 probe: does CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 (spec §6.1) keep the Agent call in the foreground?
// Same subagent prompt/agents/outputFormat as a2-fixtures.mjs; cleanEnv() strips CLAUDE_CODE_*, so the flag is re-added after cleaning.
import { record, cleanEnv, fail, FIXTURES } from './lib.mjs';
import { redactFile, blockTexts } from './redact.mjs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';

const errors = [];
const NAME = 'subagent-nobg';
const fx = resolve(FIXTURES, `${NAME}.ndjson`);
const storyboardSchema = {
  type: 'object',
  properties: { product: { type: 'string' }, scenes: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, seconds: { type: 'number' }, onscreen_text: { type: 'string' } }, required: ['n', 'seconds', 'onscreen_text'] } } },
  required: ['product', 'scenes'],
};

let sub;
try {
  sub = await record(NAME,
    "Delegate to the storyboarder agent: a 2-scene storyboard for 'tükenmez kalem' (parts: gövde, yay, mürekkep haznesi, bilye uç). Return its result in the required structure.",
    { options: {
      env: { ...cleanEnv(), CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
      agents: { storyboarder: { description: "Writes scene-by-scene storyboards for 'what's inside' videos", prompt: 'You are a storyboard designer. Reply only with the storyboard.', tools: ['Read'], model: 'haiku' } },
      outputFormat: { type: 'json_schema', schema: storyboardSchema },
    } });
} finally {
  redactFile(fx);
}

const results = sub.filter((m) => m.type === 'result');
const started = sub.filter((m) => m.type === 'system' && m.subtype === 'task_started');
const bgChanged = sub.filter((m) => m.type === 'system' && m.subtype === 'background_tasks_changed');
const inits = sub.filter((m) => m.type === 'system' && m.subtype === 'init');
console.log(JSON.stringify({
  results: results.map((r) => ({ subtype: r.subtype, result_index: r.result_index, structured_output: !!r.structured_output })),
  task_started: started.map((s) => ({ subagent_type: s.subagent_type, is_backgrounded: s.is_backgrounded })),
  background_tasks_changed: bgChanged.length,
  inits: inits.length,
}, null, 2));
if (results.length !== 1) errors.push(`expected exactly one result, got ${results.length}`);
if (!started.length) errors.push('no task_started (agent never launched; probe inconclusive)');
if (started.some((s) => s.is_backgrounded === true)) errors.push('task_started with is_backgrounded: true despite the flag');
if (!results.at(-1)?.structured_output?.scenes?.length) errors.push('result.structured_output missing');

// Leak self-check (same as a2-fixtures.mjs)
const s = readFileSync(fx, 'utf8');
const hay = [s, ...blockTexts(fx)];
for (const n of [userInfo().username, hostname(), homedir()].filter(Boolean)) if (hay.some((h) => h.includes(n))) errors.push(`leak: contains "${n}"`);
if (/"signature":"(?!redacted")/.test(s)) errors.push('leak: unredacted thinking signature');
const emails = (s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).filter((e) => e !== 'user@example.com');
if (emails.length) errors.push(`leak: email-like ${emails[0]}`);
fail(errors);
