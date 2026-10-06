import { ACTIVE_STATUSES, type AgentSessionView, type Effort, type RoleName, type SessionKind, type SessionStatus } from '@videogen/shared';
import type { Queryable } from './client.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID.test(s);

export interface NewSession {
  id: string;
  kind: SessionKind;
  role: RoleName;
  model: string;
  effort: Effort;
  claudeSessionId: string;
  parentSessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  runDir: string;
  status: SessionStatus;
  sdkVersion?: string | null;
}

export interface SessionPatch {
  status?: SessionStatus;
  model?: string;
  startedAt?: Date;
  endedAt?: Date;
  lastEventAt?: Date;
  progress?: number | null;
  progressSource?: 'agent' | 'time' | null;
  progressMessage?: string | null;
  usage?: unknown;
  costUsd?: number | null;
  tokens?: number;
  numTurns?: number;
  terminalReason?: string | null;
  error?: string | null;
  permissionDenials?: unknown;
  cliVersion?: string | null;
  pid?: number | null;
  transcriptBlobSha?: string | null;
  rawPath?: string | null;
  waitingUntil?: Date | null;
}

const COLS: Record<keyof SessionPatch, string> = {
  status: 'status', model: 'model', startedAt: 'started_at', endedAt: 'ended_at', lastEventAt: 'last_event_at',
  progress: 'progress', progressSource: 'progress_source', progressMessage: 'progress_message', usage: 'usage',
  costUsd: 'cost_usd', tokens: 'tokens', numTurns: 'num_turns', terminalReason: 'terminal_reason', error: 'error',
  permissionDenials: 'permission_denials', cliVersion: 'cli_version', pid: 'pid', transcriptBlobSha: 'transcript_blob_sha',
  rawPath: 'raw_path', waitingUntil: 'waiting_until',
};
const JSON_COLS = new Set<keyof SessionPatch>(['usage', 'permissionDenials']);

export interface SessionRecord extends AgentSessionView {
  runDir: string;
  pid: number | null;
  rawPath: string | null;
  cliVersion: string | null;
  sdkVersion: string | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toRecord(r: Record<string, any>): SessionRecord {
  return {
    id: r.id, kind: r.kind, role: r.role, model: r.model, effort: r.effort, status: r.status,
    claudeSessionId: r.claude_session_id, parentSessionId: r.parent_session_id, threadId: r.thread_id, runId: r.run_id,
    progress: r.progress, progressSource: r.progress_source, progressMessage: r.progress_message,
    tokens: Number(r.tokens), costUsd: r.cost_usd, numTurns: r.num_turns, terminalReason: r.terminal_reason, error: r.error,
    waitingUntil: iso(r.waiting_until), createdAt: iso(r.created_at)!, startedAt: iso(r.started_at), endedAt: iso(r.ended_at),
    lastEventAt: iso(r.last_event_at), runDir: r.run_dir, pid: r.pid, rawPath: r.raw_path, cliVersion: r.cli_version, sdkVersion: r.sdk_version,
  };
}

/** The browser-facing subset (no local paths or pids). */
export function toSessionView(r: SessionRecord): AgentSessionView {
  const { runDir: _a, pid: _b, rawPath: _c, cliVersion: _d, sdkVersion: _e, ...view } = r;
  return view;
}

export async function insertSession(db: Queryable, s: NewSession): Promise<void> {
  await db.query(
    `INSERT INTO agent_sessions (id, kind, role, model, effort, claude_session_id, parent_session_id, thread_id, run_id, run_dir, status, sdk_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [s.id, s.kind, s.role, s.model, s.effort, s.claudeSessionId, s.parentSessionId ?? null, s.threadId ?? null, s.runId ?? null, s.runDir, s.status, s.sdkVersion ?? null],
  );
}

export async function updateSession(db: Queryable, id: string, p: SessionPatch): Promise<void> {
  const keys = (Object.keys(p) as (keyof SessionPatch)[]).filter((k) => p[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${COLS[k]} = $${i + 2}`);
  const vals = keys.map((k) => (JSON_COLS.has(k) && p[k] !== null ? JSON.stringify(p[k]) : p[k]));
  await db.query(`UPDATE agent_sessions SET ${sets.join(', ')} WHERE id = $1`, [id, ...vals]);
}

export async function getSession(db: Queryable, id: string): Promise<SessionRecord | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db.query('SELECT * FROM agent_sessions WHERE id = $1', [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function listSessions(db: Queryable, o: { activeOnly?: boolean; kind?: SessionKind; threadId?: string; limit?: number } = {}): Promise<SessionRecord[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  if (o.activeOnly) { vals.push([...ACTIVE_STATUSES]); where.push(`status = ANY($${vals.length})`); }
  if (o.kind) { vals.push(o.kind); where.push(`kind = $${vals.length}`); }
  if (o.threadId) { vals.push(o.threadId); where.push(`thread_id = $${vals.length}`); }
  vals.push(o.limit ?? 50);
  const { rows } = await db.query(
    `SELECT * FROM agent_sessions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT $${vals.length}`,
    vals,
  );
  return rows.map(toRecord);
}

export async function markOrphanSessions(db: Queryable): Promise<string[]> {
  const { rows } = await db.query(
    `UPDATE agent_sessions SET status = 'failed', terminal_reason = 'worker_restart', ended_at = now()
     WHERE status = ANY($1) RETURNING id`,
    [[...ACTIVE_STATUSES]],
  );
  return rows.map((r) => r.id as string);
}

export interface AgentEventInput {
  sessionId: string;
  seq: number;
  turn: number;
  type: string;
  subtype: string | null;
  parentToolUseId: string | null;
  toolUseId: string | null;
  taskId: string | null;
  payload: unknown;
}
export interface StoredAgentEvent { seq: number; turn: number; type: string; subtype: string | null; payload: Record<string, unknown>; ts: string }

export async function insertAgentEvent(db: Queryable, e: AgentEventInput): Promise<void> {
  await db.query(
    `INSERT INTO agent_events (session_id, seq, turn, type, subtype, parent_tool_use_id, tool_use_id, task_id, payload, ts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())`,
    [e.sessionId, e.seq, e.turn, e.type, e.subtype, e.parentToolUseId, e.toolUseId, e.taskId, JSON.stringify(e.payload)],
  );
}

export async function readAgentEvents(db: Queryable, sessionId: string): Promise<StoredAgentEvent[]> {
  const { rows } = await db.query('SELECT seq, turn, type, subtype, payload, ts FROM agent_events WHERE session_id = $1 ORDER BY seq', [sessionId]);
  return rows.map((r) => ({ seq: r.seq, turn: r.turn, type: r.type, subtype: r.subtype, payload: r.payload, ts: r.ts.toISOString() }));
}
