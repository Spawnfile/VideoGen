import type { Resource } from '@videogen/shared';
import type { Queryable } from './client.ts';

export type JobStatus = 'queued' | 'leased' | 'done' | 'failed' | 'cancelled';
export interface JobRecord {
  id: number;
  stepId: string;
  resource: Resource;
  priority: number;
  status: JobStatus;
  runAfter: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  attempts: number;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const toJob = (r: Record<string, any>): JobRecord => ({
  id: Number(r.id), stepId: r.step_id, resource: r.resource, priority: r.priority, status: r.status, runAfter: iso(r.run_after)!,
  leaseOwner: r.lease_owner, leaseExpiresAt: iso(r.lease_expires_at), attempts: r.attempts,
});

/** Null when the step already has an active (queued/leased) job: enqueueing is idempotent. */
export async function enqueueJob(db: Queryable, j: { stepId: string; resource: Resource; priority?: number; delayMs?: number }): Promise<JobRecord | null> {
  const { rows } = await db.query(
    `INSERT INTO jobs (step_id, resource, priority, status, run_after) VALUES ($1, $2, $3, 'queued', now() + make_interval(secs => $4::float8 / 1000))
     ON CONFLICT (step_id) WHERE status IN ('queued', 'leased') DO NOTHING RETURNING *`,
    [j.stepId, j.resource, j.priority ?? 100, j.delayMs ?? 0],
  );
  return rows[0] ? toJob(rows[0]) : null;
}

export async function claimJob(db: Queryable, o: { owner: string; resources: Resource[]; leaseMs: number }): Promise<JobRecord | null> {
  if (!o.resources.length) return null;
  const { rows } = await db.query(
    `UPDATE jobs SET status = 'leased', lease_owner = $1, lease_expires_at = now() + make_interval(secs => $3::float8 / 1000),
       heartbeat_at = now(), attempts = attempts + 1
     WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= now() AND resource = ANY($2)
                 ORDER BY priority, id FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING *`,
    [o.owner, o.resources, o.leaseMs],
  );
  return rows[0] ? toJob(rows[0]) : null;
}

/** Extends only this owner's leases; returns how many were extended. */
export async function heartbeatJobs(db: Queryable, owner: string, ids: number[], leaseMs: number): Promise<number> {
  if (!ids.length) return 0;
  const { rowCount } = await db.query(
    `UPDATE jobs SET heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => $3::float8 / 1000)
     WHERE id = ANY($2) AND status = 'leased' AND lease_owner = $1`,
    [owner, ids, leaseMs],
  );
  return rowCount ?? 0;
}

export async function finishJob(db: Queryable, id: number, status: 'done' | 'failed' | 'cancelled'): Promise<void> {
  await db.query('UPDATE jobs SET status = $2, lease_owner = NULL, lease_expires_at = NULL WHERE id = $1', [id, status]);
}

export async function requeueJob(db: Queryable, id: number, delayMs: number): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL, run_after = now() + make_interval(secs => $2::float8 / 1000) WHERE id = $1`,
    [id, delayMs],
  );
}

export async function cancelRunJobs(db: Queryable, runId: string): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE jobs SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL
     WHERE status IN ('queued', 'leased') AND step_id IN (SELECT id FROM steps WHERE run_id = $1)`,
    [runId],
  );
  return rowCount ?? 0;
}

/**
 * Spec §14: leases that ran out go back to the queue. With `foreign` (worker startup) every lease not held by this
 * worker is stale too: there is a single worker, so its predecessor is gone.
 */
export async function recoverJobs(db: Queryable, o: { owner: string; foreign: boolean }): Promise<{ jobId: number; stepId: string }[]> {
  const { rows } = await db.query(
    `UPDATE jobs SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL
     WHERE status = 'leased' AND (lease_expires_at < now() OR ($2::boolean AND lease_owner IS DISTINCT FROM $1))
     RETURNING id, step_id`,
    [o.owner, o.foreign],
  );
  return rows.map((r) => ({ jobId: Number(r.id), stepId: r.step_id })).sort((a, b) => a.jobId - b.jobId);
}
