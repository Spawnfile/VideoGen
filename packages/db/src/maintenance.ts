import { randomUUID } from 'node:crypto';
import type { Queryable } from './client.ts';

/** Plan M7 Y4: the kinds `maintenance_runs_kind_ck` allows. */
export type MaintenanceKind = 'backup' | 'gc_report' | 'gc_delete' | 'orphan_report';
export type MaintenanceStatus = 'running' | 'done' | 'failed';
export interface MaintenanceRun {
  id: string; kind: MaintenanceKind; status: MaintenanceStatus; startedAt: string; endedAt: string | null; detail: Record<string, unknown> | null;
}

const toRun = (r: Record<string, any>): MaintenanceRun => ({
  id: r.id, kind: r.kind, status: r.status, startedAt: new Date(r.started_at).toISOString(), endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null, detail: r.detail ?? null,
});

/** One maintenance job at a time (Y4): null while any row is `running`; `maintenance_one_running` decides a race. */
export async function startMaintenance(db: Queryable, kind: MaintenanceKind): Promise<string | null> {
  const { rows } = await db.query(
    `INSERT INTO maintenance_runs (id, kind, status, started_at) SELECT $1, $2, 'running', clock_timestamp()
     WHERE NOT EXISTS (SELECT 1 FROM maintenance_runs WHERE status = 'running') ON CONFLICT DO NOTHING RETURNING id`,
    [randomUUID(), kind],
  );
  return rows[0]?.id ?? null;
}

/** running → done | failed; false when the row is no longer running (e.g. failed by a restart's recover). */
export async function finishMaintenance(db: Queryable, id: string, status: 'done' | 'failed', detail: Record<string, unknown>): Promise<boolean> {
  const { rowCount } = await db.query(
    "UPDATE maintenance_runs SET status = $2, ended_at = clock_timestamp(), detail = $3 WHERE id = $1 AND status = 'running'",
    [id, status, JSON.stringify(detail)],
  );
  return rowCount === 1;
}

/** Worker start: a `running` row belongs to a dead process (single worker, §14). */
export async function failRunningMaintenance(db: Queryable, reason: string): Promise<MaintenanceRun[]> {
  const { rows } = await db.query(
    `UPDATE maintenance_runs SET status = 'failed', ended_at = clock_timestamp(), detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('error', $1::text)
     WHERE status = 'running' RETURNING *`,
    [reason],
  );
  return rows.map(toRun);
}

/** The newest row of a kind; `statuses` narrows it (e.g. the last finished or the last successful one). */
export async function latestMaintenance(db: Queryable, kind: MaintenanceKind, statuses?: MaintenanceStatus[]): Promise<MaintenanceRun | null> {
  const { rows } = statuses
    ? await db.query('SELECT * FROM maintenance_runs WHERE kind = $1 AND status = ANY($2) ORDER BY started_at DESC, id DESC LIMIT 1', [kind, statuses])
    : await db.query('SELECT * FROM maintenance_runs WHERE kind = $1 ORDER BY started_at DESC, id DESC LIMIT 1', [kind]);
  return rows[0] ? toRun(rows[0]) : null;
}

export async function getMaintenance(db: Queryable, id: string): Promise<MaintenanceRun | null> {
  const { rows } = await db.query('SELECT * FROM maintenance_runs WHERE id = $1', [id]);
  return rows[0] ? toRun(rows[0]) : null;
}

/** The job holding the single slot, if any. */
export async function runningMaintenance(db: Queryable): Promise<MaintenanceKind | null> {
  const { rows } = await db.query("SELECT kind FROM maintenance_runs WHERE status = 'running' LIMIT 1");
  return rows[0]?.kind ?? null;
}
