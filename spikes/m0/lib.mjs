import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const FIXTURES = resolve(ROOT, 'tests/fixtures/claude-streams');
export const WORK = resolve(import.meta.dirname, 'work');
mkdirSync(FIXTURES, { recursive: true });
mkdirSync(WORK, { recursive: true });

const DROP = /^(CLAUDECODE$|CLAUDE_CODE_|ANTHROPIC_API_KEY$|ANTHROPIC_AUTH_TOKEN$)/;

export function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!DROP.test(k) && v !== undefined) env[k] = v;
  env.ENABLE_TOOL_SEARCH = 'false';
  return env;
}

export function baseOptions(cwd = WORK) {
  return {
    model: 'haiku',
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    plugins: [{ type: 'local', path: resolve(ROOT, 'claude-plugin') }],
    env: cleanEnv(),
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    includePartialMessages: true,
    includeHookEvents: true,
    forwardSubagentText: true,
    agentProgressSummaries: true,
    thinking: { type: 'adaptive', display: 'summarized' },
    maxTurns: 6,
    cwd,
    stderr: (d) => process.stderr.write(`[cli] ${d}`),
  };
}

export async function record(name, prompt, extra = {}) {
  const t0 = Date.now();
  const lines = [];
  const q = query({ prompt, options: { ...baseOptions(extra.cwd), ...(extra.options ?? {}) } });
  if (extra.onQuery) extra.onQuery(q);
  for await (const m of q) lines.push({ t: Date.now() - t0, m });
  writeFileSync(resolve(FIXTURES, `${name}.ndjson`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return lines.map((l) => l.m);
}

export function fail(errors) {
  if (errors.length) {
    console.error('FAIL\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log('PASS');
}
