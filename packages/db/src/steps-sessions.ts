import type { Queryable } from './client.ts';

/**
 * The newest agent session of a step (plan B15: a restarted build resumes it instead of opening a fresh session). `role` narrows it
 * for steps that run several roles (plan F24: the review step has four).
 */
export async function latestStepSession(db: Queryable, stepId: string, role?: string): Promise<{ id: string; claudeSessionId: string; role: string } | null> {
  const { rows } = await db.query(
    'SELECT id, claude_session_id, role FROM agent_sessions WHERE step_id = $1 AND ($2::text IS NULL OR role = $2) ORDER BY created_at DESC LIMIT 1',
    [stepId, role ?? null],
  );
  return rows[0] ? { id: rows[0].id, claudeSessionId: rows[0].claude_session_id, role: rows[0].role } : null;
}
