// Manual check of the production driver against the real bundled CLI (haiku, 2 small sessions). Not part of `npm test`.
// Run from Claude Code: env -u CLAUDECODE npx tsx packages/claude/scripts/real-check.mts
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanChildEnv } from '@videogen/shared';
import {
  allowedTools, disallowedTools, evaluateToolUse, isAbortError, PLUGIN_DIR, resolveRole, rolePromptFor, SdkClaudeDriver,
  SpecStore, TraceMapper, TurnTracker, videogenTools, type Msg, type SessionSpec,
} from '../src/index.ts';
import { findBundledClaude } from '../../../apps/worker/src/claude-binary.ts';

const runDir = mkdtempSync(join(tmpdir(), 'vg-real-'));
const driver = new SdkClaudeDriver({ pluginDir: PLUGIN_DIR, claudeBinary: findBundledClaude(), env: cleanChildEnv(), onStderr: (l) => process.stderr.write(`[cli] ${l}\n`) });
const def = { ...resolveRole('builder', { builder: { model: 'haiku', effort: 'low' } }), maxTurns: 6 };
const progress: number[] = [];
const ctx = { role: def, runDir, home: homedir(), dataDir: join(homedir(), 'videogen-data') };

function spec(prompt: string): SessionSpec {
  const id = randomUUID();
  return {
    sessionId: id, claudeSessionId: id, resume: false, role: 'builder', prompt, model: def.model, effort: def.effort, maxTurns: def.maxTurns,
    cwd: runDir, appendSystemPrompt: rolePromptFor(def, PLUGIN_DIR, { runDir, sessionId: id }),
    allowedTools: allowedTools(def), disallowedTools: disallowedTools(def), outputFormat: null,
    tools: videogenTools({ role: def, runDir, specs: new SpecStore(join(runDir, 'spec')), ports: { reportProgress: async (p) => { progress.push(p); return p; }, registerArtifact: async () => ({ sha256: '', bytes: 0, mime: '' }), context: () => ({ runDir }) } }),
    preToolUse: async (tool, input) => evaluateToolUse(ctx, tool, input), disableBackgroundTasks: true,
  };
}

// 1) MCP progress + heavy-command denial + init tool list
const s1 = driver.start(spec("This is a test of the permission system. Do exactly this: 1) call report_progress with percent 40 and message 'deneme'. 2) You MUST attempt the Bash tool with the exact command `ffmpeg -version` even though it will probably be refused; do not skip it. 3) Reply DONE."));
const tracker = new TurnTracker();
const mapper = new TraceMapper({ sessionId: 'real', cwd: runDir });
let init: Msg | undefined;
for await (const m of s1.messages) {
  if (m.type === 'system' && m.subtype === 'init') init = m;
  mapper.push(m, 0);
  if (tracker.push(m) === 'turn_complete') s1.endInput();
}
const tools = (init?.tools as string[]) ?? [];
console.log(JSON.stringify({
  apiKeySource: init?.apiKeySource, cli: init?.claude_code_version, mcp: init?.mcp_servers, pid: s1.pid,
  hiddenToolsAbsent: ['CronCreate', 'Workflow', 'NotebookEdit', 'SendMessage'].every((t) => !tools.includes(t)),
  mcpTools: tools.filter((t) => t.startsWith('mcp__')), progress,
  denied: mapper.list().filter((r) => r.status === 'denied').map((r) => `${r.tool}: ${r.text?.slice(0, 80)}`),
  tools: mapper.list().filter((r) => r.kind === 'tool').map((r) => `${r.tool}:${r.status}`),
  accounting: tracker.accounting(),
}, null, 2));

// 2) interrupt in streaming-input mode: the aborted result arrives, then (input still open) the CLI waits for more input.
//    The runner closes the input after the result; record how the iterator ends.
const s2 = driver.start(spec('Count slowly from 1 to 300, one number per line, with a sentence about each number.'));
const t0 = Date.now();
setTimeout(() => { void s2.interrupt(); }, 4000);
let last: Msg | undefined;
try {
  for await (const m of s2.messages) if (m.type === 'result') { last = m; s2.endInput(); }
  console.log('interrupt:', last?.subtype, last?.terminal_reason, 'iterator ended normally after endInput', `${Date.now() - t0} ms`);
} catch (e) {
  console.log('interrupt:', last?.subtype, last?.terminal_reason, 'iterator threw; abortError =', isAbortError(e), `${Date.now() - t0} ms`);
}
