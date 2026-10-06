import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { getBlob } from '@videogen/db';

/**
 * Content-addressed media (spec §5.1 medya sunucusu, §11.3): HTTP Range through @fastify/static's sendFile (rooted at the data
 * dir, registered with `serve: false` in app.ts). Only a 64-hex sha that is in `blobs` resolves; content never changes.
 */
export function registerMediaRoutes(app: FastifyInstance, deps: { pool: pg.Pool; dataDir: string }): void {
  app.get('/api/blobs/:sha', async (req, reply) => {
    const sha = (req.params as { sha: string }).sha;
    if (!/^[0-9a-f]{64}$/.test(sha)) return reply.code(400).send({ error: 'geçersiz sha256' });
    const blob = await getBlob(deps.pool, sha);
    if (!blob || !existsSync(join(deps.dataDir, blob.path))) return reply.code(404).send({ error: 'not found' });
    // Content-addressed: the bytes behind a sha never change (send's own cache-control, so it is not overwritten).
    return reply.type(blob.mime).sendFile(blob.path, deps.dataDir, { maxAge: 365 * 24 * 3600 * 1000, immutable: true });
  });
}
