import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cleanChildEnv } from '@videogen/shared';
import { buildQueryOptions, GroupSampler, groupAlive, killGroup, memAvailableMb, readGroupPids, type SessionSpec } from '../src/index.ts';

const dirty = { PATH: '/usr/bin', HOME: '/home/x', ANTHROPIC_API_KEY: 'sk-x', CLAUDECODE: '1', CLAUDE_CODE_FOO: '1', ANTHROPIC_BASE_URL: 'http://evil' };
const opts = { pluginDir: '/abs/claude-plugin', claudeBinary: '/abs/claude', env: cleanChildEnv(dirty) };
function spec(over: Partial<SessionSpec> = {}): SessionSpec {
  return {
    sessionId: 'a', claudeSessionId: '11111111-1111-4111-8111-111111111111', resume: false, role: 'builder', prompt: 'hi', model: 'haiku', effort: 'low',
    maxTurns: 6, cwd: '/abs/run', appendSystemPrompt: 'ROLE', allowedTools: ['Read'], disallowedTools: ['Agent'], outputFormat: null,
    tools: [{ name: 'report_progress', description: 'p', shape: { percent: z.number() }, handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }],
    preToolUse: async (tool) => (tool === 'Bash' ? { allow: false, reason: 'nope' } : { allow: true }), disableBackgroundTasks: true, ...over,
  };
}

describe('buildQueryOptions', () => {
  it('isolates every session and never bypasses permissions', () => {
    const o = buildQueryOptions(spec(), opts) as Record<string, any>;
    expect(o).toMatchObject({
      settingSources: [], strictMcpConfig: true, permissionMode: 'dontAsk', permissionPrompts: 'none',
      includePartialMessages: true, forwardSubagentText: true, agentProgressSummaries: true,
      thinking: { type: 'adaptive', display: 'summarized' }, pathToClaudeCodeExecutable: '/abs/claude', cwd: '/abs/run',
      plugins: [{ type: 'local', path: '/abs/claude-plugin' }], model: 'haiku', effort: 'low', maxTurns: 6,
      allowedTools: ['Read'], disallowedTools: ['Agent'], systemPrompt: { type: 'preset', preset: 'claude_code', append: 'ROLE' },
    });
    expect(JSON.stringify({ ...o, mcpServers: null })).not.toMatch(/bypassPermissions|--bare/); // the MCP instance is circular
    expect(o.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1');
    expect(o.env.ENABLE_TOOL_SEARCH).toBe('false');
    for (const k of ['ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_FOO', 'ANTHROPIC_BASE_URL']) expect(o.env[k], k).toBeUndefined();
    expect(Object.keys(o.mcpServers)).toEqual(['videogen']);
    expect(o.mcpServers.videogen.type).toBe('sdk');
    expect(typeof o.spawnClaudeCodeProcess).toBe('function');
  });

  it('new sessions pin sessionId, resumed sessions use resume; no MCP server without tools', () => {
    const fresh = buildQueryOptions(spec(), opts) as Record<string, any>;
    expect(fresh.sessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(fresh.resume).toBeUndefined();
    const res = buildQueryOptions(spec({ resume: true, tools: [], disableBackgroundTasks: false, outputFormat: { type: 'json_schema', schema: { type: 'object' } } }), opts) as Record<string, any>;
    expect(res.resume).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.sessionId).toBeUndefined();
    expect(res.mcpServers).toEqual({});
    expect(res.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBeUndefined();
    expect(res.outputFormat).toEqual({ type: 'json_schema', schema: { type: 'object' } });
  });

  it('the PreToolUse hook turns a guard denial into permissionDecision deny with the reason', async () => {
    const o = buildQueryOptions(spec(), opts) as Record<string, any>;
    const [matcher] = o.hooks.PreToolUse;
    expect(matcher.matcher).toBeUndefined();
    const hook = matcher.hooks[0];
    const signal = new AbortController().signal;
    await expect(hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' }, 't1', { signal }))
      .resolves.toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'nope' } });
    await expect(hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {}, tool_use_id: 't2' }, 't2', { signal })).resolves.toEqual({});
  });
});

describe('process group helpers', () => {
  it('samples CPU/RSS of a detached group and kills the whole group', async () => {
    const child = spawn(process.execPath, ['-e', 'const end = Date.now() + 20000; while (Date.now() < end) {}'], { detached: true, stdio: 'ignore' });
    const pgid = child.pid!;
    expect(readGroupPids(pgid)).toContain(pgid);
    const s = new GroupSampler(pgid);
    await s.sample();
    await new Promise((r) => setTimeout(r, 500));
    const x = await s.sample();
    expect(x!.cpuPct).toBeGreaterThan(20);
    expect(x!.rssMb).toBeGreaterThan(5);
    expect(x!.procs).toBe(1);
    expect(killGroup(pgid, 'SIGTERM')).toBe(true);
    await new Promise((r) => child.once('exit', r));
    expect(groupAlive(pgid)).toBe(false);
    expect(await s.sample()).toBeNull();
    expect(killGroup(pgid, 'SIGKILL')).toBe(false);
  });

  it('reads MemAvailable', () => {
    expect(memAvailableMb()).toBeGreaterThan(0);
  });
});
