import { spawn } from 'node:child_process';
import { createSdkMcpServer, query, tool, type Options, type Query } from '@anthropic-ai/claude-agent-sdk';
import { AsyncQueue } from './async-queue.ts';
import type { ClaudeDriver, DriverSession, ProcSample, SessionSpec } from './driver.ts';
import type { Msg } from './messages.ts';
import { GroupSampler, killGroup } from './proc.ts';

export interface SdkDriverOptions {
  pluginDir: string;
  claudeBinary: string;
  /** Already cleaned with cleanChildEnv(); the background-task flag is added per session after cleaning. */
  env: Record<string, string>;
  onStderr?: (line: string) => void;
}

type UserMessage = { type: 'user'; message: { role: 'user'; content: string }; parent_tool_use_id: null };
const userMessage = (text: string): UserMessage => ({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });

/** Pure: every isolation and permission rule of spec §6.1 lives here and is unit-tested. */
export function buildQueryOptions(spec: SessionSpec, o: SdkDriverOptions, onSpawn?: (pid: number) => void): Options {
  return {
    model: spec.model,
    effort: spec.effort,
    ...(spec.maxTurns ? { maxTurns: spec.maxTurns } : {}),
    cwd: spec.cwd,
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: spec.tools.length
      ? { videogen: createSdkMcpServer({ name: 'videogen', version: '1.0.0', tools: spec.tools.map((t) => tool(t.name, t.description, t.shape, t.handler)) }) }
      : {},
    plugins: [{ type: 'local', path: o.pluginDir }],
    // Added after cleaning (the cleaner drops every CLAUDE_CODE_*). M4b probe P1: long in-process MCP calls (Blender) must never
    // be moved to the background either; that is already off for non-interactive sessions, pinned here explicitly.
    env: { ...o.env, ...(spec.disableBackgroundTasks ? { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1', CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0' } : {}) },
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    allowedTools: spec.allowedTools,
    disallowedTools: spec.disallowedTools,
    hooks: {
      PreToolUse: [{
        hooks: [async (input, toolUseId) => {
          if (input.hook_event_name !== 'PreToolUse') return {};
          const d = await spec.preToolUse(input.tool_name, input.tool_input, input.tool_use_id ?? toolUseId ?? '');
          return d.allow ? {} : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: d.reason } };
        }],
      }],
    },
    includePartialMessages: true,
    forwardSubagentText: true,
    agentProgressSummaries: true,
    thinking: { type: 'adaptive', display: 'summarized' },
    systemPrompt: { type: 'preset', preset: 'claude_code', append: spec.appendSystemPrompt },
    ...(spec.outputFormat ? { outputFormat: spec.outputFormat } : {}),
    pathToClaudeCodeExecutable: o.claudeBinary,
    ...(spec.resume ? { resume: spec.claudeSessionId } : { sessionId: spec.claudeSessionId }),
    spawnClaudeCodeProcess: (s) => {
      // Own process group: SIGTERM/SIGKILL to -pid reaches the CLI and everything it started (spec §6.4).
      const cp = spawn(s.command, s.args, { cwd: s.cwd, env: s.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true, signal: s.signal });
      if (cp.pid) onSpawn?.(cp.pid);
      let buf = '';
      cp.stderr.setEncoding('utf8').on('data', (d: string) => {
        buf += d;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const l of lines) if (l) o.onStderr?.(l);
      });
      return cp;
    },
  };
}

class SdkSession implements DriverSession {
  pid: number | null = null;
  readonly messages: AsyncIterable<Msg>;
  private inbox = new AsyncQueue<UserMessage>();
  private q: Query;
  private sampler: GroupSampler | null = null;

  constructor(spec: SessionSpec, o: SdkDriverOptions) {
    this.inbox.push(userMessage(spec.prompt));
    this.q = query({ prompt: this.inbox, options: buildQueryOptions(spec, o, (pid) => { this.pid = pid; this.sampler = new GroupSampler(pid); }) });
    this.messages = this.q as AsyncIterable<Msg>;
  }

  send(text: string): void { this.inbox.push(userMessage(text)); }
  endInput(): void { this.inbox.end(); }
  async interrupt(): Promise<void> { await this.q.interrupt(); }
  kill(signal: 'SIGTERM' | 'SIGKILL'): void {
    if (this.pid) killGroup(this.pid, signal);
    if (signal === 'SIGKILL') this.q.close();
  }
  async sample(): Promise<ProcSample | null> { return this.sampler ? this.sampler.sample() : null; }
}

/** Real sessions through the pinned Agent SDK and its bundled CLI (K20). */
export class SdkClaudeDriver implements ClaudeDriver {
  readonly kind = 'sdk' as const;
  constructor(private readonly o: SdkDriverOptions) {}
  start(spec: SessionSpec): DriverSession {
    return new SdkSession(spec, this.o);
  }
}
