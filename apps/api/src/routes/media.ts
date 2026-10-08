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
    // Plan M6 Y21: `?download=<name>` asks the browser to save the file; only a plain safe name (no path, no quote).
    const download = (req.query as { download?: string }).download;
    if (download !== undefined && !/^[a-z0-9][a-z0-9-]{0,79}\.mp4$/.test(download)) return reply.code(400).send({ error: 'geçersiz dosya adı' });
    const blob = await getBlob(deps.pool, sha);
    if (!blob || !existsSync(join(deps.dataDir, blob.path))) return reply.code(404).send({ error: 'not found' });
    // Content-addressed: the bytes behind a sha never change (send's own cache-control, so it is not overwritten).
    // `contentType: false`: the stored mime wins over send's extension lookup (which says audio/x-flac for the voice stem).
    const type = /^text\/|^application\/json$/.test(blob.mime) && !/charset/i.test(blob.mime) ? `${blob.mime}; charset=utf-8` : blob.mime;
    if (download) reply.header('content-disposition', `attachment; filename="${download}"`);
    return reply.type(type).sendFile(blob.path, deps.dataDir, { maxAge: 365 * 24 * 3600 * 1000, immutable: true, contentType: false });
  });
}
