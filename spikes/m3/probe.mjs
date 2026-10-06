// M3 plan probe (haiku, 2 small sessions). Verifies what M0 never exercised:
//  1) in-process MCP (createSdkMcpServer + tool) callable under dontAsk + allowedTools
//  2) options.sessionId sets the session id; streaming input carries a 2nd user turn in the same session
//  3) PreToolUse hook sees Bash tool_input.command and its deny reason reaches the model
//  4) spawnClaudeCodeProcess with detached:true gives us the CLI pid / process group
//  5) resume: a new query with options.resume continues the conversation
//  6) effort option + systemPrompt preset append are accepted
// Prints a JSON summary only; records no fixture (nothing to redact). Run: env -u CLAUDECODE node spikes/m3/probe.mjs
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const ROOT = resolve(import.meta.dirname, '../..');
const DROP = /^(CLAUDECODE$|CLAUDE_CODE_|ANTHROPIC_API_KEY$|ANTHROPIC_AUTH_TOKEN$)/;
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && !DROP.test(k)));
env.ENABLE_TOOL_SEARCH = 'false';
env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';

const cwd = mkdtempSync(join(tmpdir(), 'vg-m3-probe-'));
const sessionId = randomUUID();
const mcpCalls = [];
const hookSeen = [];
const pids = [];

const server = () => createSdkMcpServer({
  name: 'videogen',
  version: '0.0.1',
  tools: [tool('report_progress', 'Report a progress milestone (percent 0-100).', { percent: z.number(), message: z.string() }, async (args) => {
    mcpCalls.push(args);
    return { content: [{ type: 'text', text: `ok ${args.percent}` }] };
  })],
});

const guard = async (input) => {
  hookSeen.push({ tool: input.tool_name, input: input.tool_input });
  const cmd = input.tool_input?.command;
  if (input.tool_name === 'Bash' && typeof cmd === 'string' && /\bffmpeg\b/.test(cmd)) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Heavy commands are not allowed in Bash; use the MCP tool mcp__videogen__render_draft instead.' } };
  }
  return {};
};

const base = (extra) => ({
  model: 'haiku',
  effort: 'low',
  settingSources: [],
  strictMcpConfig: true,
  mcpServers: { videogen: server() },
  plugins: [{ type: 'local', path: resolve(ROOT, 'claude-plugin') }],
  env,
  permissionMode: 'dontAsk',
  permissionPrompts: 'none',
  allowedTools: ['mcp__videogen__report_progress', 'Bash'],
  hooks: { PreToolUse: [{ matcher: 'Bash|Write|Edit|NotebookEdit', hooks: [guard] }] },
  includePartialMessages: true,
  systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Your codename is KESTREL.' },
  maxTurns: 8,
  cwd,
  spawnClaudeCodeProcess: (o) => {
    const cp = spawn(o.command, o.args, { cwd: o.cwd, env: o.env, stdio: ['pipe', 'pipe', 'ignore'], detached: true, signal: o.signal });
    pids.push(cp.pid);
    return cp;
  },
  ...extra,
});

const user = (text) => ({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });

async function session(opts, turns) {
  const out = { msgs: [], results: [], texts: [] };
  let next;
  let waiting = Promise.resolve();
  const inbox = (async function* () {
    for (const t of turns) {
      await waiting;
      waiting = new Promise((r) => { next = r; });
      yield user(t);
    }
    await waiting;
  })();
  const q = query({ prompt: inbox, options: opts });
  for await (const m of q) {
    out.msgs.push(m);
    if (m.type === 'assistant') for (const b of m.message.content) if (b.type === 'text') out.texts.push(b.text);
    if (m.type === 'result') { out.results.push({ subtype: m.subtype, num_turns: m.num_turns, denials: m.permission_denials?.map((d) => d.tool_name) }); next?.(); }
  }
  return out;
}

const a = await session(base({ sessionId }), [
  "Do these steps in order. 1) Call the report_progress tool with percent 50 and message 'yarı'. 2) Run the bash command: ffmpeg -version. 3) Run the bash command: ls. 4) Reply with your codename and the number 7731.",
  'What number did you just mention? Reply with the number only.',
]);
const initA = a.msgs.find((m) => m.type === 'system' && m.subtype === 'init');
const denyText = a.msgs.flatMap((m) => (m.type === 'user' && Array.isArray(m.message?.content) ? m.message.content : []))
  .filter((b) => b.type === 'tool_result' && b.is_error).map((b) => String(typeof b.content === 'string' ? b.content : JSON.stringify(b.content)).slice(0, 200));

const pidAlive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
const b = await session(base({ resume: sessionId }), ['What was your codename and the number from earlier? Reply in one short line.']);
const initB = b.msgs.find((m) => m.type === 'system' && m.subtype === 'init');

console.log(JSON.stringify({
  sessionIdRequested: sessionId,
  initSessionIdMatches: initA?.session_id === sessionId,
  initMcpServers: initA?.mcp_servers,
  mcpToolListed: initA?.tools?.filter((t) => t.startsWith('mcp__')),
  agents: initA?.agents,
  mcpCalls,
  hookSeen: hookSeen.map((h) => `${h.tool}:${String(h.input?.command ?? h.input?.file_path ?? '').slice(0, 40)}`),
  denyText,
  resultsA: a.results,
  textsA: a.texts.map((t) => t.slice(0, 120)),
  pids: pids.length,
  pidsAliveAfter: pids.map(pidAlive),
  resumeInitSessionId: initB?.session_id === sessionId ? 'same' : initB?.session_id ? 'different' : 'none',
  resultsB: b.results,
  textsB: b.texts.map((t) => t.slice(0, 160)),
}, null, 2));
