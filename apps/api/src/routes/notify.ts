import type pg from 'pg';

/** Commands carry ids only (never user text): NOTIFY payloads are < 8 KB and land in worker logs on failure. */
export async function sendCommand(pool: pg.Pool, cmd: Record<string, unknown>): Promise<void> {
  await pool.query('SELECT pg_notify($1, $2)', ['vg_commands', JSON.stringify(cmd)]);
}
