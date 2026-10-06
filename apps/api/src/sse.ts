import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { maxEventId, readEventsAfter } from '@videogen/db';
import type { EventHub, SseMessage } from './event-hub.ts';

export function registerSse(app: FastifyInstance, deps: { pool: pg.Pool; hub: EventHub; heartbeatMs?: number }): void {
  app.get('/events', async (req, reply) => {
    const q = req.query as { after?: string };
    const raw = req.headers['last-event-id'] ?? q.after;
    const requested = raw === undefined || raw === '' ? NaN : Number(raw);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 2000\n\n');

    // sentId is fixed only after subscribing (below): a fresh connect, or an id beyond the DB's max (reset/restore), starts at the
    // current max with no replay; the client refetches REST state on open. An explicit id replays everything after it.
    let sentId = 0;
    let replaying = true;
    const buffered: SseMessage[] = [];
    const send = (m: SseMessage) => {
      if (m.id !== undefined) {
        if (m.id <= sentId) return;
        sentId = m.id;
        res.write(`id: ${m.id}\n`);
      }
      res.write(`event: ${m.event}\ndata: ${JSON.stringify(m.data)}\n\n`);
    };
    const unsubscribe = deps.hub.subscribe((m) => (replaying ? buffered.push(m) : send(m)));
    // Registered before the replay so a client that disconnects mid-replay cannot leak the subscription or a late heartbeat timer.
    let closed = false;
    let hb: NodeJS.Timeout | undefined;
    req.raw.on('close', () => { closed = true; clearInterval(hb); unsubscribe(); });

    try {
      const max = await maxEventId(deps.pool);
      sentId = Number.isFinite(requested) && requested >= 0 && requested <= max ? requested : max;
      for (;;) {
        const rows = await readEventsAfter(deps.pool, sentId, 1000);
        for (const e of rows) send({ id: e.id, event: 'ui', data: e });
        if (rows.length < 1000 || closed) break;
      }
    } catch (err) {
      req.log.error({ err }, 'sse replay failed');
      unsubscribe();
      res.destroy();
      return;
    }
    replaying = false;
    for (const m of buffered) send(m);

    const beat = () => res.write(`event: hb\ndata: {"ts":${Date.now()}}\n\n`);
    if (!closed) { beat(); hb = setInterval(beat, deps.heartbeatMs ?? 15_000); }
  });
}
