import type { Queryable } from './client.ts';

/**
 * The newest agent session of a step (plan B15: a restarted build resumes it instead of opening a fresh session). `role` narrows it
 * for steps that run several roles (plan F24: the review step has four). `since` is a lower bound on the session's creation (the start
 * of a final fix round: a session of an earlier round is never resumed).
 */
export async function latestStepSession(db: Queryable, stepId: string, role?: string, since?: Date): Promise<{ id: string; claudeSessionId: string; role: string } | null> {
  const { rows } = await db.query(
    'SELECT id, claude_session_id, role FROM agent_sessions WHERE step_id = $1 AND ($2::text IS NULL OR role = $2) AND ($3::timestamptz IS NULL OR created_at >= $3) ORDER BY created_at DESC LIMIT 1',
    [stepId, role ?? null, since ?? null],
  );
  return rows[0] ? { id: rows[0].id, claudeSessionId: rows[0].claude_session_id, role: rows[0].role } : null;
}
