import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { sendCommand } from './notify.ts';

/**
 * Dev only (smoke tests, plan M6 T8): the worker seeds a `ready` video (`dev.video.ready`); the API waits for its audit row (keyed by a request
 * id) and returns the video id. The API never imports worker code.
 */
export function registerDevReadyVideo(app: FastifyInstance, pool: pg.Pool): void {
  app.post('/api/dev/videos/ready', async (req, reply) => {
    const b = z.object({ productName: z.string().max(80).optional(), aigc: z.boolean().optional() }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'invalid request' });
    const requestId = randomUUID();
    await sendCommand(pool, { type: 'dev.video.ready', requestId, ...b.data });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const r = (await pool.query("SELECT data->>'videoId' AS id FROM audit_log WHERE action = 'dev.video.ready' AND data->>'requestId' = $1 LIMIT 1", [requestId])).rows[0];
      if (r?.id) return reply.code(201).send({ videoId: r.id });
      await new Promise((r2) => setTimeout(r2, 200));
    }
    return reply.code(504).send({ error: 'the seed video was not ready in time' });
  });
}
