import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { normalizeProductName, youtubeTitleFrom, type EpisodeEntry } from '@videogen/shared';
import { appendAudit } from './audit.ts';
import { publishEvent } from './events.ts';
import { putBlob } from './media.ts';
import { getVideoView, insertArtifact } from './pipeline.ts';

export interface EpisodeMedia { file: string; cover: string; durationMs: number; width: number; height: number; codec: string; caption: string | null }
export type ImportOutcome = { kind: 'imported'; videoId: string; versionId: string } | { kind: 'exists'; videoId: string } | { kind: 'sha_mismatch'; actual: string };

/**
 * Video library L9/L10: an episode made outside the pipeline becomes a ready, read-only video with one version whose final and cover have
 * the shape `listVersions`/`VIDEO_SQL` read. Blobs are stored first (idempotent; an orphan is the GC's), then the rows in one transaction.
 */
export async function importEpisode(pool: pg.Pool, dataDir: string, entry: EpisodeEntry, media: EpisodeMedia): Promise<ImportOutcome> {
  const existing = (await pool.query(
    `SELECT r.video_id FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE a.kind = 'final_video_music' AND a.blob_sha = $1 LIMIT 1`, [entry.sha256],
  )).rows[0];
  if (existing) return { kind: 'exists', videoId: existing.video_id };
  const video = await putBlob(pool, dataDir, media.file);
  if (video.sha256 !== entry.sha256) return { kind: 'sha_mismatch', actual: video.sha256 };
  const cover = await putBlob(pool, dataDir, media.cover);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query(
      `INSERT INTO products (id, name, normalized_name) VALUES ($1, $2, $3)
       ON CONFLICT (normalized_name) DO UPDATE SET normalized_name = EXCLUDED.normalized_name RETURNING id`,
      [randomUUID(), entry.product, normalizeProductName(entry.product)],
    );
    const videoId = randomUUID();
    const versionId = randomUUID();
    const runId = randomUUID();
    const caption = media.caption?.trim() ? media.caption.trim() : null;
    await c.query(
      `INSERT INTO videos (id, product_id, title, audio_mode, language, status, origin, approach, caption, youtube_title, current_version_id, best_version_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ready', 'import', $6, $7, $8, $9, $9, $10, $10)`,
      [videoId, p.rows[0].id, entry.title, entry.audioMode, entry.language, entry.approach, caption, caption ? youtubeTitleFrom(caption) : null, versionId, entry.recordedAt],
    );
    await c.query(`INSERT INTO versions (id, video_id, round, reason, created_at) VALUES ($1, $2, 0, 'import', $3)`, [versionId, videoId, entry.recordedAt]);
    await c.query(
      `INSERT INTO runs (id, video_id, kind, trigger, plan, status, progress, created_at, started_at, ended_at)
       VALUES ($1, $2, 'import', 'cli', '[]', 'done', 1, $3, $3, $3)`,
      [runId, videoId, entry.recordedAt],
    );
    await insertArtifact(c, { runId, versionId, kind: 'final_video_music', blobSha: video.sha256, inputHash: video.sha256, durationMs: media.durationMs, width: media.width, height: media.height, codec: media.codec });
    await insertArtifact(c, { runId, versionId, kind: 'final_cover', blobSha: cover.sha256, inputHash: video.sha256 });
    await appendAudit(c, {
      actorType: 'user', action: 'video.imported', subjectType: 'video', subjectId: videoId, runId,
      data: { slug: entry.slug, sha: video.sha256, bytes: video.bytes, durationS: Math.round(media.durationMs / 100) / 10 },
    });
    await publishEvent(c, { topic: 'videos', type: 'video.updated', payload: (await getVideoView(c, videoId))! });
    await c.query('COMMIT');
    return { kind: 'imported', videoId, versionId };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
