import type { z } from 'zod';
import type { Effort, RoleName } from '@videogen/shared';
import type { Msg } from './messages.ts';

export interface ProcSample { cpuPct: number; rssMb: number; procs: number }
/** A type alias, not an interface: the SDK's CallToolResult has an index signature. */
export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
export interface VgTool {
  name: string;
  description: string;
  shape: Record<string, z.ZodType>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}
export type GuardDecision = { allow: true } | { allow: false; reason: string };

/** Scenario for FakeClaudeDriver: replay a fixture, optionally stalling, injecting or failing at given line indexes. */
export interface FakeScript {
  fixture: string;
  /** After yielding line `afterIndex`, go silent for `ms` (cancel ends it). CPU reads `cpuPct`, then 0 after `zeroCpuAfterMs`. */
  stall?: { afterIndex: number; ms: number; cpuPct?: number; zeroCpuAfterMs?: number };
  /** Synthetic messages yielded right after line `afterIndex` (e.g. a rejected rate_limit_event). */
  inject?: { afterIndex: number; m: Msg }[];
  /** Throw `error` right after yielding line `index` (API error, crash). */
  failAfter?: { index: number; error: string };
  /** Fake mode for pipeline steps: every `result` of this turn carries this `structured_output`. */
  structured?: unknown;
}

export interface SessionSpec {
  /** Our agent_sessions id (audit correlation). */
  sessionId: string;
  /** Claude's own session id: equals sessionId for a new session; the earlier id when resuming. */
  claudeSessionId: string;
  resume: boolean;
  role: RoleName;
  prompt: string;
  model: string;
  effort: Effort;
  maxTurns: number | null;
  cwd: string;
  appendSystemPrompt: string;
  allowedTools: string[];
  disallowedTools: string[];
  outputFormat: { type: 'json_schema'; schema: Record<string, unknown> } | null;
  tools: VgTool[];
  preToolUse: (tool: string, input: unknown, toolUseId: string) => Promise<GuardDecision>;
  disableBackgroundTasks: boolean;
  /** Only read by FakeClaudeDriver. */
  fakeScript?: FakeScript;
}

export interface DriverSession {
  /** Leader pid of the session's process group (null for the fake driver or before spawn). */
  readonly pid: number | null;
  readonly messages: AsyncIterable<Msg>;
  /** Next user turn on the same session (streaming input). */
  send(text: string): void;
  /** Closes the input stream; the CLI exits after the current turn. */
  endInput(): void;
  interrupt(): Promise<void>;
  /** Signals the whole process group (SDK) or ends playback (fake). */
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
  sample(): Promise<ProcSample | null>;
}

export interface ClaudeDriver {
  readonly kind: 'sdk' | 'fake';
  start(spec: SessionSpec): DriverSession;
}
