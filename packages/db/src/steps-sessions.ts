import type { Queryable } from './client.ts';

/** The newest agent session of a step (plan B15: a restarted build resumes it instead of opening a fresh session). */
export async function latestStepSession(db: Queryable, stepId: string): Promise<{ id: string; claudeSessionId: string; role: string } | null> {
  const { rows } = await db.query('SELECT id, claude_session_id, role FROM agent_sessions WHERE step_id = $1 ORDER BY created_at DESC LIMIT 1', [stepId]);
  return rows[0] ? { id: rows[0].id, claudeSessionId: rows[0].claude_session_id, role: rows[0].role } : null;
}
