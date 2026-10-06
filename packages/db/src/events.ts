import type { LiveEvent, UiEvent } from '@videogen/shared';
import type { Queryable } from './client.ts';

/*
 * INVARIANT: ui_events rows are written only by vg_publish_event (migration 0003, SECURITY DEFINER; the app role has
 * no INSERT/UPDATE). It takes advisory lock 72720001 so commit order equals id order and SSE replay never skips.
 */

function toEvent(r: { id: string | number; ts: Date; topic: string; type: string; payload: unknown }): UiEvent {
  return { id: Number(r.id), ts: r.ts.toISOString(), topic: r.topic, type: r.type, payload: r.payload };
}

/** Insert + NOTIFY through the DB-enforced publisher (works on a pool or inside a caller's transaction). */
export async function publishEvent(db: Queryable, e: { topic: string; type: string; payload: unknown }): Promise<UiEvent> {
  const { rows } = await db.query('SELECT id, ts, topic, type, payload FROM vg_publish_event($1, $2, $3)', [e.topic, e.type, JSON.stringify(e.payload ?? null)]);
  return toEvent(rows[0]);
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
