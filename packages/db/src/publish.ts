import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  ACTIVE_PUBLICATION_STATUSES, DAY_MS, nextDraftSlot, PublicationSchema, type Publication, type PublicationStatus, type PublishVariant,
} from '@videogen/shared';
import type { Queryable } from './client.ts';

/** Plan M6 Y6: the advisory lock keys (two-key form: no hashtext collision). */
export const VG_LOCK_NS = 0x5647; // "VG"
export const LOCK_PUBLISH_LIMIT = 1;
export const LOCK_TIKTOK_TOKENS = 2;
export const LOCK_TIKTOK_RATE = 3;

const toPublication = (r: Record<string, any>): Publication => PublicationSchema.parse({
  id: r.id, videoId: r.video_id, versionId: r.version_id, target: r.target, variant: r.variant, status: r.status, blobSha: r.blob_sha,
  bytes: Number(r.bytes), publishId: r.publish_id, failReason: r.fail_reason, errorCode: r.error_code, caption: r.caption,
  aigcRequired: r.aigc_required, checklist: r.checklist, url: r.url, createdAt: r.created_at, sentAt: r.sent_at, publishedAt: r.published_at,
  updatedAt: r.updated_at,
});

const ACTIVE_SQL = `(${ACTIVE_PUBLICATION_STATUSES.map((s) => `'${s}'`).join(',')})`;

export type CreatePublicationResult =
  | { kind: 'created'; publication: Publication }
  | { kind: 'active'; publication: Publication }
  | { kind: 'sent'; publication: Publication }
  | { kind: 'limit'; nextSlot: Date };

/**
 * Plan M6 Y6: one transaction under the limit lock — the video's active send wins (double click), a sent/published row of the same version
 * and variant needs `confirmResend`, then the 24 h limit, then the insert. The partial unique index is the last line of defence.
 */
export async function createPublication(
  pool: pg.Pool,
  i: { videoId: string; versionId: string; variant: PublishVariant; blobSha: string; bytes: number; caption: string; aigcRequired: boolean; confirmResend?: boolean; now?: Date },
): Promise<CreatePublicationResult> {
  const now = i.now ?? new Date();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1, $2)', [VG_LOCK_NS, LOCK_PUBLISH_LIMIT]);
    const active = await c.query(`SELECT * FROM publications WHERE video_id = $1 AND status IN ${ACTIVE_SQL} LIMIT 1`, [i.videoId]);
    if (active.rows[0]) { await c.query('ROLLBACK'); return { kind: 'active', publication: toPublication(active.rows[0]) }; }
    if (!i.confirmResend) {
      const sent = await c.query("SELECT * FROM publications WHERE version_id = $1 AND variant = $2 AND status IN ('sent','published') ORDER BY created_at DESC LIMIT 1", [i.versionId, i.variant]);
      if (sent.rows[0]) { await c.query('ROLLBACK'); return { kind: 'sent', publication: toPublication(sent.rows[0]) }; }
    }
    const recent = await c.query('SELECT created_at, status, publish_id FROM publications WHERE created_at > $1', [new Date(now.getTime() - DAY_MS)]);
    const slot = nextDraftSlot(recent.rows.map((r) => ({ createdAt: r.created_at, status: r.status, publishId: r.publish_id })), now);
    if (slot) { await c.query('ROLLBACK'); return { kind: 'limit', nextSlot: slot }; }
    const { rows } = await c.query(
      `INSERT INTO publications (id, video_id, version_id, variant, blob_sha, bytes, caption, aigc_required, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING *`,
      [randomUUID(), i.videoId, i.versionId, i.variant, i.blobSha, i.bytes, i.caption, i.aigcRequired, now],
    );
    await c.query('COMMIT');
    return { kind: 'created', publication: toPublication(rows[0]) };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    if ((e as { code?: string }).code === '23505') {
      const { rows } = await pool.query(`SELECT * FROM publications WHERE video_id = $1 AND status IN ${ACTIVE_SQL} LIMIT 1`, [i.videoId]);
      if (rows[0]) return { kind: 'active', publication: toPublication(rows[0]) };
    }
    throw e;
  } finally {
    c.release();
  }
}

export async function getPublication(db: Queryable, id: string): Promise<Publication | null> {
  const { rows } = await db.query('SELECT * FROM publications WHERE id = $1', [id]);
  return rows[0] ? toPublication(rows[0]) : null;
}

/** queued → uploading as one conditional write: only one claimer wins. */
export async function claimPublication(db: Queryable, id: string): Promise<Publication | null> {
  return advancePublication(db, id, ['queued'], { status: 'uploading' });
}

export interface PublicationPatch {
  status?: PublicationStatus; publishId?: string; failReason?: string | null; errorCode?: string | null; sentAt?: Date;
}

/** A conditional transition (`WHERE status = ANY(from)`); null when the row was not in an expected state. */
export async function advancePublication(db: Queryable, id: string, from: PublicationStatus[], p: PublicationPatch): Promise<Publication | null> {
  const { rows } = await db.query(
    `UPDATE publications SET status = coalesce($3, status), publish_id = coalesce($4, publish_id),
       fail_reason = CASE WHEN $5::boolean THEN $6 ELSE fail_reason END, error_code = CASE WHEN $7::boolean THEN $8 ELSE error_code END,
       sent_at = coalesce($9, sent_at), updated_at = now()
     WHERE id = $1 AND status = ANY($2::text[]) RETURNING *`,
    [id, from, p.status ?? null, p.publishId ?? null, p.failReason !== undefined, p.failReason ?? null, p.errorCode !== undefined, p.errorCode ?? null, p.sentAt ?? null],
  );
  return rows[0] ? toPublication(rows[0]) : null;
}

/** Y13: sent → published and the video → published, in one transaction. */
export async function markPublished(pool: pg.Pool, id: string, i: { url: string; checklist: Record<string, boolean> }): Promise<Publication | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      "UPDATE publications SET status = 'published', url = $2, checklist = $3, published_at = now(), updated_at = now() WHERE id = $1 AND status = 'sent' RETURNING *",
      [id, i.url, JSON.stringify(i.checklist)],
    );
    if (!rows[0]) { await c.query('ROLLBACK'); return null; }
    await c.query("UPDATE videos SET status = 'published', status_note = NULL, updated_at = now() WHERE id = $1", [rows[0].video_id]);
    await c.query('COMMIT');
    return toPublication(rows[0]);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Y8: only a queued send can be cancelled (nothing reached TikTok yet). */
export async function cancelPublication(db: Queryable, id: string): Promise<Publication | null> {
  return advancePublication(db, id, ['queued'], { status: 'failed', failReason: 'Gönderim iptal edildi.', errorCode: 'cancelled' });
}

export async function listPublications(db: Queryable, videoId: string): Promise<Publication[]> {
  const { rows } = await db.query('SELECT * FROM publications WHERE video_id = $1 ORDER BY created_at DESC, id DESC', [videoId]);
  return rows.map(toPublication);
}

export async function recentPublications(db: Queryable, since: Date): Promise<Publication[]> {
  const { rows } = await db.query('SELECT * FROM publications WHERE created_at > $1 ORDER BY created_at', [since]);
  return rows.map(toPublication);
}

/** Y8 recovery: every row the worker has not settled. */
export async function unfinishedPublications(db: Queryable): Promise<Publication[]> {
  const { rows } = await db.query("SELECT * FROM publications WHERE status IN ('queued','uploading','processing','waiting') ORDER BY created_at");
  return rows.map(toPublication);
}

/** Y8 sweep: queued rows whose command may have been lost. */
export async function staleQueued(db: Queryable, o: { olderThanMs: number; now?: Date }): Promise<Publication[]> {
  const now = o.now ?? new Date();
  const { rows } = await db.query("SELECT * FROM publications WHERE status = 'queued' AND updated_at < $1 ORDER BY created_at", [new Date(now.getTime() - o.olderThanMs)]);
  return rows.map(toPublication);
}

export interface ClaimRecord { claimId: string; ordinal: number; textTr: string; sources: unknown; status: 'verified' | 'unverified'; verifiedAt: string | null }

/** Y15: the version's claims, once (a replay changes nothing). Status is per gate (G2), not per claim. */
export async function snapshotClaims(
  db: Queryable,
  i: { videoId: string; versionId: string; claims: { id: string; text_tr: string; sources: unknown }[]; verifiedAt: Date | null },
): Promise<number> {
  let n = 0;
  for (const [ordinal, cl] of i.claims.entries()) {
    const r = await db.query(
      `INSERT INTO claims (video_id, version_id, claim_id, ordinal, text_tr, sources, status, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (version_id, claim_id) DO NOTHING`,
      [i.videoId, i.versionId, cl.id, ordinal, cl.text_tr, JSON.stringify(cl.sources), i.verifiedAt ? 'verified' : 'unverified', i.verifiedAt],
    );
    n += r.rowCount ?? 0;
  }
  return n;
}

export async function listClaims(db: Queryable, versionId: string): Promise<ClaimRecord[]> {
  const { rows } = await db.query('SELECT * FROM claims WHERE version_id = $1 ORDER BY ordinal', [versionId]);
  return rows.map((r) => ({ claimId: r.claim_id, ordinal: r.ordinal, textTr: r.text_tr, sources: r.sources, status: r.status, verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null }));
}
