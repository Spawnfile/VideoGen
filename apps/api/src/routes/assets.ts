import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { LEDGER_KINDS, licenseVerdict, UPLOAD_EXTS, UPLOAD_MAX_BYTES, type AssetListItem, type Config } from '@videogen/shared';
import { assetUsage, importAssetFile, isUuid, listAssets, revokeAssetAudited, type AssetRecord } from '@videogen/db';

/** Upload ids are server-made v4 uuids (lower case); nothing else names a file under uploads/. */
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isExt = (s: unknown): s is (typeof UPLOAD_EXTS)[number] => typeof s === 'string' && (UPLOAD_EXTS as readonly string[]).includes(s);
const text = (max: number) => z.string().trim().min(1).max(max);

const ImportBody = z.object({
  uploadId: z.string().regex(UPLOAD_ID),
  kind: z.enum(LEDGER_KINDS),
  title: text(200),
  license: text(100),
  author: text(200),
  licenseText: text(20_000),
  attribution: z.string().trim().max(500).optional(),
  source: z.union([z.literal(''), z.string().trim().max(500).url().refine((u) => /^https?:\/\//.test(u), 'http(s)')]).optional(),
  tags: z.array(text(40)).max(20).optional(),
});
const RevokeBody = z.object({ reason: text(500) });

/** ffprobe next to the configured ffmpeg (the worker's ffprobeOf; the API does not import the worker). */
const ffprobeOf = (ffmpeg: string) => (/ffmpeg$/.test(ffmpeg) ? ffmpeg.replace(/ffmpeg$/, 'ffprobe') : 'ffprobe');
function audioDurationMs(ffmpeg: string, file: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(ffprobeOf(ffmpeg), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 15_000 }, (err, out) => {
      const s = Number(String(out).trim());
      resolve(err || !Number.isFinite(s) || s <= 0 ? null : Math.round(s * 1000));
    });
  });
}

class TooLarge extends Error {}

/** The stored verdict's reason: the revocation's, else today's license rule for a row that is not allowed. */
export function listItem(a: AssetRecord, used: number): AssetListItem {
  const reason = a.revokedAt ? a.revokeReason : a.allowed ? null : (licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: a.kind }).reason_tr ?? 'izinsiz');
  return {
    id: a.id, kind: a.kind, title: a.title, licenseSpdx: a.licenseSpdx, author: a.author, sourceUrl: a.sourceUrl, attribution: a.attribution, allowed: a.allowed, reason,
    revokedAt: a.revokedAt, revokeReason: a.revokeReason, durationMs: a.durationMs, tags: a.tags, blobSha: a.blobSha, createdAt: a.createdAt, used,
  };
}

/**
 * Plan M7 Y8: the asset ledger — list with usage, upload (streamed to `<dataDir>/uploads/<uuid>.<ext>`, ffprobe-checked), import through the
 * license gate (a rejected file is recorded too) and revocation (audited; the narrator's own reference resets to the stock voice). Writes need a
 * local Origin (guard.ts).
 */
export function registerAssetRoutes(app: FastifyInstance, deps: { pool: pg.Pool; config: Config; uploadMaxBytes?: number }): void {
  const { pool } = deps;
  const ffmpeg = deps.config.render.ffmpeg;
  const max = deps.uploadMaxBytes ?? UPLOAD_MAX_BYTES;
  const uploadsDir = join(deps.config.dataDir, 'uploads');
  const item = async (a: AssetRecord) => listItem(a, (await assetUsage(pool)).get(a.id) ?? 0);

  app.get('/api/assets', async (req, reply) => {
    const kind = (req.query as { kind?: string }).kind;
    if (kind !== undefined && !(LEDGER_KINDS as readonly string[]).includes(kind)) return reply.code(400).send({ error: 'geçersiz tür' });
    const [rows, used] = await Promise.all([listAssets(pool, kind ? { kind: kind as (typeof LEDGER_KINDS)[number] } : {}), assetUsage(pool)]);
    return rows.filter((a) => (LEDGER_KINDS as readonly string[]).includes(a.kind)).map((a) => listItem(a, used.get(a.id) ?? 0));
  });

  // The octet-stream parser hands the raw request stream to this route only (encapsulated); nothing is buffered in memory.
  void app.register(async (scope) => {
    scope.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
    scope.post('/api/uploads', async (req, reply) => {
      const ext = (req.query as { ext?: unknown }).ext;
      if (!isExt(ext)) return reply.code(400).send({ error: `dosya türü şunlardan biri olmalı: ${UPLOAD_EXTS.join(', ')}` });
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > max) return reply.code(413).send({ error: 'dosya 200 MB sınırını aşıyor' });
      const body = req.body as NodeJS.ReadableStream | undefined;
      if (!body || typeof body.pipe !== 'function') return reply.code(400).send({ error: 'dosya gövdesi yok' });
      await mkdir(uploadsDir, { recursive: true });
      const uploadId = randomUUID();
      const file = join(uploadsDir, `${uploadId}.${ext}`);
      const hash = createHash('sha256');
      let bytes = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          bytes += chunk.length;
          if (bytes > max) return cb(new TooLarge());
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      try {
        await pipeline(body, meter, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
      } catch (e) {
        await rm(file, { force: true });
        if (e instanceof TooLarge) return reply.code(413).send({ error: 'dosya 200 MB sınırını aşıyor' });
        throw e;
      }
      const durationMs = bytes > 0 ? await audioDurationMs(ffmpeg, file) : null;
      if (durationMs === null) {
        await rm(file, { force: true });
        return reply.code(400).send({ error: 'dosya ses olarak okunamadı' });
      }
      return reply.code(201).send({ uploadId, sha: hash.digest('hex'), bytes, durationMs });
    });
  });

  app.post('/api/assets', async (req, reply) => {
    const b = ImportBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'geçersiz istek' });
    const i = b.data;
    // The upload is found by listing the folder (an exact `<uuid>.<ext>` entry); the request never builds a path.
    const name = (await readdir(uploadsDir).catch(() => [] as string[])).find((n) => UPLOAD_EXTS.some((x) => n === `${i.uploadId}.${x}`));
    if (!name) return reply.code(404).send({ error: 'yükleme bulunamadı (1 saatten eski yüklemeler silinir)' });
    const file = join(uploadsDir, name);
    const licenseFile = join(uploadsDir, `${randomUUID()}.license.txt`);
    let r: Awaited<ReturnType<typeof importAssetFile>>;
    try {
      await writeFile(licenseFile, `${i.licenseText}\n`, { mode: 0o600 });
      r = await importAssetFile(pool, deps.config.dataDir, {
        kind: i.kind, file, title: i.title, spdx: i.license, author: i.author, licenseTextFile: licenseFile,
        ...(i.source ? { sourceUrl: i.source } : {}), ...(i.attribution ? { attribution: i.attribution } : {}), ...(i.tags?.length ? { tags: i.tags } : {}),
      }, { durationMs: (f) => audioDurationMs(ffmpeg, f) });
    } finally {
      // The blob store holds a copy now (or the import failed): the upload is removed either way, before the reply.
      await rm(file, { force: true });
      await rm(licenseFile, { force: true });
    }
    return reply.code(r.inserted ? 201 : 200).send({ created: r.inserted, asset: await item(r.asset) });
  });

  app.post('/api/assets/:id/revoke', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!isUuid(id)) return reply.code(400).send({ error: 'geçersiz varlık' });
    const b = RevokeBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'gerekçe gerekli' });
    const r = await revokeAssetAudited(pool, id, b.data.reason);
    if (r.kind === 'missing') return reply.code(404).send({ error: 'varlık bulunamadı' });
    if (r.kind === 'already') return reply.code(409).send({ error: 'bu varlığın izni zaten geri alınmış', asset: await item(r.asset) });
    return { asset: await item(r.asset), narratorReset: r.narratorReset };
  });
}
