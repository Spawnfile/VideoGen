/** Browser-safe agent types shared by worker, API and web. */
export const ROLE_NAMES = [
  'researcher', 'storyboarder', 'builder', 'audio_director', 'reviewer_visual',
  'reviewer_facts', 'reviewer_retention', 'fixer', 'chat', 'summarizer',
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  researcher: 'Araştırmacı',
  storyboarder: 'Storyboard',
  builder: 'Video üretim',
  audio_director: 'Ses yönetmeni',
  reviewer_visual: 'Görsel reviewer',
  reviewer_facts: 'Doğruluk reviewer',
  reviewer_retention: 'İzlenme reviewer',
  fixer: 'Düzeltici',
  chat: 'Chat',
  summarizer: 'Özetleyici',
};

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ModelAlias = 'opus' | 'sonnet' | 'haiku';
export type SessionKind = 'pipeline' | 'chat';
export type SessionStatus =
  | 'queued' | 'starting' | 'thinking' | 'tool' | 'idle'
  | 'waiting_limit' | 'waiting_gpu' | 'done' | 'failed' | 'cancelled';
export const ACTIVE_STATUSES: readonly SessionStatus[] = ['queued', 'starting', 'thinking', 'tool', 'idle', 'waiting_limit', 'waiting_gpu'];

export interface AgentSessionView {
  id: string;
  kind: SessionKind;
  role: RoleName;
  model: string;
  effort: Effort;
  status: SessionStatus;
  claudeSessionId: string;
  parentSessionId: string | null;
  threadId: string | null;
  runId: string | null;
  progress: number | null;
  progressSource: 'agent' | 'time' | null;
  progressMessage: string | null;
  tokens: number;
  costUsd: number | null;
  numTurns: number;
  terminalReason: string | null;
  error: string | null;
  waitingUntil: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  lastEventAt: string | null;
}

export type Liveness = 'active' | 'quiet_alive' | 'maybe_stuck';
export interface AgentSample { sessionId: string; cpuPct: number | null; rssMb: number | null; silentMs: number; liveness: Liveness }

export type TraceVariant = 'steps' | 'reasoning' | 'search' | 'coding' | 'text';
export type TraceRowStatus = 'running' | 'done' | 'error' | 'denied';
export interface TraceItem { title: string; href: string; domain: string }
export interface TraceRow {
  id: string;
  sessionId: string;
  turn: number;
  seq: number;
  parentToolUseId: string | null;
  variant: TraceVariant;
  kind: 'thinking' | 'text' | 'tool' | 'subagent';
  tool?: string;
  title: string;
  detail?: string;
  note?: string;
  text?: string;
  mono?: boolean;
  href?: string;
  status: TraceRowStatus;
  add?: number;
  del?: number;
  tokens?: number;
  count?: number;
  items?: TraceItem[];
  startedAt: number;
  endedAt?: number;
}
export type TraceOp =
  | { op: 'upsert'; row: TraceRow }
  | { op: 'delta'; rowId: string; text: string }
  | { op: 'tokens'; rowId: string; tokens: number };
/** One entry of a `trace.delta` live payload: `{ sessionId, d: LiveTraceItem[] }`. */
export interface LiveTraceItem { rowId: string; text?: string; tokens?: number }

export interface ChatThread { id: string; title: string; videoId: string | null; claudeSessionId: string | null; createdAt: string; updatedAt: string }
export const CHAT_MODES = ['ask', 'analyze', 'fix'] as const;
export type ChatMode = (typeof CHAT_MODES)[number];
export type ChatMessageStatus = 'queued' | 'running' | 'done' | 'interrupted' | 'failed' | 'waiting_limit';
export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  text: string;
  status: ChatMessageStatus;
  mode: ChatMode;
  sessionId: string | null;
  turn: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface GuardState {
  blocked: boolean;
  reason: 'five_hour' | 'seven_day' | 'rejected' | null;
  resumeAt: string | null;
  fiveHour: number | null;
  sevenDay: number | null;
}
/** Spec §12.3: "maybe stuck" needs BOTH long silence and an idle (or unknown) CPU; silence alone means quiet but alive. */
export function classifyLiveness(x: { silentMs: number; cpuPct: number | null; quietAfterMs?: number; stuckAfterMs?: number }): Liveness {
  const quiet = x.quietAfterMs ?? 10_000;
  const stuck = x.stuckAfterMs ?? 120_000;
  if (x.silentMs >= stuck && (x.cpuPct === null || x.cpuPct < 1)) return 'maybe_stuck';
  return x.silentMs >= quiet ? 'quiet_alive' : 'active';
}
