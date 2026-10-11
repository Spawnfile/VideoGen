import type pg from 'pg';
import { attributionLines, type AssetKind, type Platform, type PlatformAction, type PlatformEvent, type VideoView } from '@videogen/shared';
import { appendAudit } from './audit.ts';
import type { Queryable } from './client.ts';
import { publishEvent } from './events.ts';
import { getVideoView } from './pipeline.ts';

export type PlatformEventError = 'video_not_found' | 'no_final' | 'not_uploaded';
export type PlatformEventResult = { event: PlatformEvent; video: VideoView } | { error: PlatformEventError } | { error: 'licence_refused'; refused: string[] };

const toEvent = (r: Record<string, any>): PlatformEvent => ({
  id: Number(r.id), platform: r.platform, action: r.action, versionId: r.version_id, uploadedAt: new Date(r.uploaded_at).toISOString(),
  url: r.url ?? null, note: r.note ?? null, createdAt: new Date(r.created_at).toISOString(),
});
const blank = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

/**
 * The licence gate the removed publish path had (plan M6 Y12), for the best version's final: the attribution lines its caption must carry
 * and the ledger assets that are no longer allowed. A final without a sound plan (imported, or composer-only music) has neither.
 */
export async function finalLicence(db: Queryable, videoId: string): Promise<{ attributions: string[]; refused: string[] }> {
  const none = { attributions: [], refused: [] };
  const f = (await db.query(
    `SELECT a.run_id, a.version_id FROM videos v JOIN artifacts a ON a.version_id = v.best_version_id AND a.kind = 'final_video_music'
     WHERE v.id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT 1`, [videoId],
  )).rows[0];
  if (!f) return none;
  const plan = (await db.query(
    `SELECT content FROM artifacts WHERE run_id = $1 AND kind = 'audio_plan' ORDER BY (version_id = $2) DESC NULLS LAST, created_at DESC, id DESC LIMIT 1`,
    [f.run_id, f.version_id],
  )).rows[0]?.content as { cues?: { assetId: string }[]; music?: { assetId?: string | null } | null } | undefined;
  if (!plan) return none;
  const sound = { cues: (plan.cues ?? []).map((c) => ({ assetId: c.assetId })), music: plan.music?.assetId ? { assetId: plan.music.assetId } : null };
  const ids = [...new Set([...sound.cues.map((c) => c.assetId), ...(sound.music ? [sound.music.assetId] : [])])];
  const assets = ids.length
    ? (await db.query('SELECT id, title, license_spdx, attribution, allowed, kind, author FROM assets WHERE id = ANY($1::uuid[])', [ids])).rows.map((a) => ({
      id: a.id, title: a.title, licenseSpdx: a.license_spdx, attribution: a.attribution, allowed: a.allowed, kind: a.kind as AssetKind, own: a.author === 'VideoGen (prosedürel)',
    }))
    : [];
  const r = attributionLines(sound, assets);
  return { attributions: r.lines, refused: r.refused };
}

/**
 * Video library L13–L17: one mark or undo — the row, its audit entry and `video.updated` in one transaction; the video row is locked so
 * two devices marking at once are ordered. An upload points at the best version (refused while its final uses a revoked asset); an undo
 * at the upload it undoes.
 */
export async function recordPlatformEvent(
  pool: pg.Pool,
  inp: { videoId: string; platform: Platform; action: PlatformAction; uploadedAt?: Date; url?: string | null; note?: string | null },
): Promise<PlatformEventResult> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const v = (await c.query('SELECT id, best_version_id FROM videos WHERE id = $1 FOR UPDATE', [inp.videoId])).rows[0];
    if (!v) { await c.query('ROLLBACK'); return { error: 'video_not_found' }; }
    let versionId: string;
    if (inp.action === 'uploaded') {
      const f = v.best_version_id
        ? (await c.query("SELECT 1 FROM artifacts WHERE version_id = $1 AND kind = 'final_video_music' LIMIT 1", [v.best_version_id])).rowCount
        : 0;
      if (!f) { await c.query('ROLLBACK'); return { error: 'no_final' }; }
      const lic = await finalLicence(c, inp.videoId);
      if (lic.refused.length) { await c.query('ROLLBACK'); return { error: 'licence_refused', refused: lic.refused }; }
      versionId = v.best_version_id;
    } else {
      const last = (await c.query('SELECT action, version_id FROM platform_uploads WHERE video_id = $1 AND platform = $2 ORDER BY id DESC LIMIT 1', [inp.videoId, inp.platform])).rows[0];
      if (!last || last.action !== 'uploaded') { await c.query('ROLLBACK'); return { error: 'not_uploaded' }; }
      versionId = last.version_id;
    }
    const url = blank(inp.url);
    const note = blank(inp.note);
    const row = (await c.query(
      `INSERT INTO platform_uploads (video_id, version_id, platform, action, uploaded_at, url, note)
       VALUES ($1, $2, $3, $4, coalesce($5, now()), $6, $7) RETURNING *`,
      [inp.videoId, versionId, inp.platform, inp.action, inp.uploadedAt ?? null, url, note],
    )).rows[0];
    const event = toEvent(row);
    await appendAudit(c, {
      actorType: 'user', action: `platform.${inp.action}`, subjectType: 'video', subjectId: inp.videoId,
      data: { platform: inp.platform, versionId, hasUrl: url !== null, uploadedAt: event.uploadedAt },
    });
    await c.query('UPDATE videos SET updated_at = now() WHERE id = $1', [inp.videoId]);
    const video = (await getVideoView(c, inp.videoId))!;
    await publishEvent(c, { topic: 'videos', type: 'video.updated', payload: video });
    await c.query('COMMIT');
    return { event, video };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** The upload log of a video, newest first. */
export async function listPlatformEvents(db: Queryable, videoId: string): Promise<PlatformEvent[]> {
  const { rows } = await db.query('SELECT * FROM platform_uploads WHERE video_id = $1 ORDER BY id DESC', [videoId]);
  return rows.map(toEvent);
}

/** Video library L12/L17: the caption and YouTube title the user copies; each changed field is audited; empty text is stored as null. */
export async function setVideoText(pool: pg.Pool, videoId: string, p: { caption?: string | null; youtubeTitle?: string | null }): Promise<VideoView | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (!(await c.query('SELECT id FROM videos WHERE id = $1 FOR UPDATE', [videoId])).rowCount) { await c.query('ROLLBACK'); return null; }
    const fields: [string, string, string | null | undefined][] = [['caption', 'caption', p.caption], ['youtubeTitle', 'youtube_title', p.youtubeTitle]];
    for (const [field, col, value] of fields) {
      if (value === undefined) continue;
      const v = blank(value);
      await c.query(`UPDATE videos SET ${col} = $2, updated_at = now() WHERE id = $1`, [videoId, v]);
      await appendAudit(c, { actorType: 'user', action: 'video.text_edited', subjectType: 'video', subjectId: videoId, data: { field, length: v?.length ?? 0, preview: v?.slice(0, 120) ?? null } });
    }
    const video = (await getVideoView(c, videoId))!;
    await publishEvent(c, { topic: 'videos', type: 'video.updated', payload: video });
    await c.query('COMMIT');
    return video;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
