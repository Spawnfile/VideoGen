import type pg from 'pg';
import type { LiveEvent, UiEvent } from '@videogen/shared';
import type { Queryable } from './client.ts';

/*
 * INVARIANT: all writes to ui_events MUST go through publishEvent (advisory lock 72720001
 * serializes nextval+commit); a direct INSERT can commit a smaller id late and break SSE replay.
 * DB-level enforcement is deferred to M3.
 */
const UI_EVENTS_LOCK = 72720001;

function toEvent(r: { id: string | number; ts: Date; topic: string; type: string; payload: unknown }): UiEvent {
  return { id: Number(r.id), ts: r.ts.toISOString(), topic: r.topic, type: r.type, payload: r.payload };
}

/** Insert + NOTIFY in one transaction under an advisory lock, so commit order equals id order
 *  and SSE replay by id can never skip an event committed late with a smaller id. */
export async function publishEvent(pool: pg.Pool, e: { topic: string; type: string; payload: unknown }): Promise<UiEvent> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [UI_EVENTS_LOCK]);
    const { rows } = await c.query(
      'INSERT INTO ui_events (ts, topic, type, payload) VALUES (clock_timestamp(), $1, $2, $3) RETURNING id, ts, topic, type, payload',
      [e.topic, e.type, JSON.stringify(e.payload ?? null)],
    );
    await c.query('SELECT pg_notify($1, $2)', ['vg_events', String(rows[0].id)]);
    await c.query('COMMIT');
    return toEvent(rows[0]);
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

export async function publishLive(db: Queryable, e: LiveEvent): Promise<void> {
  const s = JSON.stringify(e);
  if (Buffer.byteLength(s) > 7900) throw new Error(`live payload too large (${Buffer.byteLength(s)} bytes)`);
  await db.query('SELECT pg_notify($1, $2)', ['vg_live', s]);
}

export async function readEventsAfter(db: Queryable, afterId: number, limit = 1000): Promise<UiEvent[]> {
  const { rows } = await db.query(
    'SELECT id, ts, topic, type, payload FROM ui_events WHERE id > $1 ORDER BY id LIMIT $2',
    [afterId, limit],
  );
  return rows.map(toEvent);
}

export async function maxEventId(db: Queryable): Promise<number> {
  const { rows } = await db.query('SELECT coalesce(max(id), 0) AS id FROM ui_events');
  return Number(rows[0].id);
}

export async function pruneEvents(db: Queryable, days: number): Promise<number> {
  const r = await db.query(`DELETE FROM ui_events WHERE ts < now() - make_interval(days => $1)`, [days]);
  return r.rowCount ?? 0;
}
