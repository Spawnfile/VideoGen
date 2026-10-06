import type { ChatMessage, ChatMessageStatus, ChatMode, ChatThread } from '@videogen/shared';
import type { Queryable } from './client.ts';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const thread = (r: Record<string, any>): ChatThread => ({ id: r.id, title: r.title, videoId: r.video_id, claudeSessionId: r.claude_session_id, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)! });
const message = (r: Record<string, any>): ChatMessage => ({
  id: r.id, threadId: r.thread_id, role: r.role, text: r.text, status: r.status, mode: r.mode, sessionId: r.session_id, turn: r.turn,
  createdAt: iso(r.created_at)!, completedAt: iso(r.completed_at),
});

export async function createThread(db: Queryable, t: { id: string; title: string; videoId?: string | null }): Promise<ChatThread> {
  const { rows } = await db.query('INSERT INTO chat_threads (id, title, video_id) VALUES ($1, $2, $3) RETURNING *', [t.id, t.title, t.videoId ?? null]);
  return thread(rows[0]);
}
export async function listThreads(db: Queryable, limit = 50): Promise<ChatThread[]> {
  const { rows } = await db.query('SELECT * FROM chat_threads ORDER BY updated_at DESC LIMIT $1', [limit]);
  return rows.map(thread);
}
export async function getThread(db: Queryable, id: string): Promise<ChatThread | null> {
  const { rows } = await db.query('SELECT * FROM chat_threads WHERE id = $1', [id]);
  return rows[0] ? thread(rows[0]) : null;
}
export async function setThreadClaudeSession(db: Queryable, id: string, claudeSessionId: string): Promise<void> {
  await db.query('UPDATE chat_threads SET claude_session_id = $2, updated_at = now() WHERE id = $1', [id, claudeSessionId]);
}

export async function insertChatMessage(db: Queryable, m: { id: string; threadId: string; role: 'user' | 'assistant'; text: string; status: ChatMessageStatus; sessionId?: string | null; turn?: number | null; mode?: ChatMode }): Promise<ChatMessage> {
  const { rows } = await db.query(
    `INSERT INTO chat_messages (id, thread_id, role, text, status, session_id, turn, mode, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp(), CASE WHEN $5 = 'done' THEN now() END) RETURNING *`,
    [m.id, m.threadId, m.role, m.text, m.status, m.sessionId ?? null, m.turn ?? null, m.mode ?? 'ask'],
  );
  await db.query('UPDATE chat_threads SET updated_at = now() WHERE id = $1', [m.threadId]);
  return message(rows[0]);
}
export async function updateChatMessage(db: Queryable, id: string, p: { status?: ChatMessageStatus; sessionId?: string; turn?: number; completedAt?: Date }): Promise<ChatMessage | null> {
  const { rows } = await db.query(
    `UPDATE chat_messages SET status = coalesce($2, status), session_id = coalesce($3, session_id), turn = coalesce($4, turn),
       completed_at = coalesce($5, completed_at) WHERE id = $1 RETURNING *`,
    [id, p.status ?? null, p.sessionId ?? null, p.turn ?? null, p.completedAt ?? null],
  );
  return rows[0] ? message(rows[0]) : null;
}
export async function getChatMessage(db: Queryable, id: string): Promise<ChatMessage | null> {
  const { rows } = await db.query('SELECT * FROM chat_messages WHERE id = $1', [id]);
  return rows[0] ? message(rows[0]) : null;
}
export async function listChatMessages(db: Queryable, threadId: string): Promise<ChatMessage[]> {
  const { rows } = await db.query('SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at, id', [threadId]);
  return rows.map(message);
}
export async function chatMessagesByStatus(db: Queryable, statuses: ChatMessageStatus[]): Promise<ChatMessage[]> {
  const { rows } = await db.query('SELECT * FROM chat_messages WHERE status = ANY($1) ORDER BY created_at, id', [statuses]);
  return rows.map(message);
}

export async function renameThread(db: Queryable, id: string, title: string): Promise<void> {
  await db.query('UPDATE chat_threads SET title = $2, updated_at = now() WHERE id = $1', [id, title]);
}
