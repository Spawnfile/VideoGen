import { randomUUID } from 'node:crypto';
import type { AssetKind } from '@videogen/shared';
import type pg from 'pg';
import { appendAudit } from './audit.ts';
import type { Queryable } from './client.ts';
import { resetNarratorForRevokedRef } from './voice.ts';

export interface NewAsset {
  kind: AssetKind; title: string; blobSha: string; licenseSpdx: string; author: string; allowed: boolean;
  sourceUrl?: string | null; attribution?: string | null; licenseSnapshotSha?: string | null; tags?: string[]; durationMs?: number | null;
}
export interface AssetRecord extends Required<Omit<NewAsset, 'tags'>> {
  id: string; tags: string[]; createdAt: string;
  /** Plan M7 Y8: a revocation (allowed is false from then on); `updatedAt` is the last change after the import. */
  revokedAt: string | null; revokeReason: string | null; updatedAt: string | null;
}

const toAsset = (r: Record<string, any>): AssetRecord => ({
  id: r.id, kind: r.kind, title: r.title, blobSha: r.blob_sha, licenseSpdx: r.license_spdx, sourceUrl: r.source_url, author: r.author, attribution: r.attribution,
  licenseSnapshotSha: r.license_snapshot_sha, allowed: r.allowed, tags: r.tags ?? [], durationMs: r.duration_ms, createdAt: new Date(r.created_at).toISOString(),
  revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null, revokeReason: r.revoke_reason ?? null, updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
});

/** Null when this blob is already registered for this kind (content addressed: one row per file and kind). */
export async function insertAsset(db: Queryable, a: NewAsset): Promise<AssetRecord | null> {
  const { rows } = await db.query(
    `INSERT INTO assets (id, kind, title, blob_sha, license_spdx, source_url, author, attribution, license_snapshot_sha, allowed, tags, duration_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp()) ON CONFLICT (blob_sha, kind) DO NOTHING RETURNING *`,
    [randomUUID(), a.kind, a.title, a.blobSha, a.licenseSpdx, a.sourceUrl ?? null, a.author, a.attribution ?? null, a.licenseSnapshotSha ?? null, a.allowed, JSON.stringify(a.tags ?? []), a.durationMs ?? null],
  );
  return rows[0] ? toAsset(rows[0]) : null;
}

export async function listAssets(db: Queryable, o: { kind?: AssetKind; allowedOnly?: boolean } = {}): Promise<AssetRecord[]> {
  const { rows } = await db.query(
    'SELECT * FROM assets WHERE ($1::text IS NULL OR kind = $1) AND (NOT $2::boolean OR allowed) ORDER BY created_at, id',
    [o.kind ?? null, o.allowedOnly ?? false],
  );
  return rows.map(toAsset);
}

export async function getAsset(db: Queryable, id: string): Promise<AssetRecord | null> {
  const { rows } = await db.query('SELECT * FROM assets WHERE id = $1', [id]);
  return rows[0] ? toAsset(rows[0]) : null;
}

export async function findAssetByBlob(db: Queryable, kind: AssetKind, blobSha: string): Promise<AssetRecord | null> {
  const { rows } = await db.query('SELECT * FROM assets WHERE kind = $1 AND blob_sha = $2', [kind, blobSha]);
  return rows[0] ? toAsset(rows[0]) : null;
}

/** Plan M7 Y8: conditional (only a row not yet revoked); not undone, the same file cannot be imported again for this kind. Null: unknown or already revoked. */
export async function revokeAsset(db: Queryable, id: string, reason: string): Promise<AssetRecord | null> {
  const { rows } = await db.query(
    `UPDATE assets SET allowed = false, revoked_at = clock_timestamp(), revoke_reason = $2, updated_at = clock_timestamp()
     WHERE id = $1 AND revoked_at IS NULL RETURNING *`,
    [id, reason],
  );
  return rows[0] ? toAsset(rows[0]) : null;
}

/** Y8 usage: per asset, the number of versions whose stored audio plan (`audio_plan`: cues and music) plays it. */
export async function assetUsage(db: Queryable): Promise<Map<string, number>> {
  const { rows } = await db.query(
    `SELECT u.asset_id, count(DISTINCT a.version_id)::int AS n
     FROM artifacts a
     CROSS JOIN LATERAL (
       SELECT a.content->'music'->>'assetId' AS asset_id
       UNION SELECT c->>'assetId' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.content->'cues') = 'array' THEN a.content->'cues' ELSE '[]'::jsonb END) c
     ) u
     WHERE a.kind = 'audio_plan' AND a.version_id IS NOT NULL AND u.asset_id IS NOT NULL
     GROUP BY u.asset_id`,
  );
  return new Map(rows.map((r) => [r.asset_id as string, r.n as number]));
}

export type RevokeResult = { kind: 'revoked'; asset: AssetRecord; narratorReset: boolean } | { kind: 'already'; asset: AssetRecord } | { kind: 'missing' };

/**
 * Y8 (API and `bin/assets.mjs revoke`): one transaction — the conditional revocation, its audit row (`asset.revoked` with the reason) and,
 * for the narrator's own reference, the reset to the stock voice (audited too).
 */
export async function revokeAssetAudited(pool: pg.Pool, id: string, reason: string): Promise<RevokeResult> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const asset = await revokeAsset(c, id, reason);
    if (!asset) {
      await c.query('ROLLBACK');
      const current = await getAsset(pool, id);
      return current ? { kind: 'already', asset: current } : { kind: 'missing' };
    }
    await appendAudit(c, { actorType: 'user', action: 'asset.revoked', subjectType: 'asset', subjectId: id, data: { kind: asset.kind, title: asset.title, reason } });
    const narratorReset = asset.kind === 'voice_ref' ? await resetNarratorForRevokedRef(c, id) : false;
    await c.query('COMMIT');
    return { kind: 'revoked', asset, narratorReset };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
