import { randomUUID } from 'node:crypto';
import type { AssetKind } from '@videogen/shared';
import type { Queryable } from './client.ts';

export interface NewAsset {
  kind: AssetKind; title: string; blobSha: string; licenseSpdx: string; author: string; allowed: boolean;
  sourceUrl?: string | null; attribution?: string | null; licenseSnapshotSha?: string | null; tags?: string[]; durationMs?: number | null;
}
export interface AssetRecord extends Required<Omit<NewAsset, 'tags'>> { id: string; tags: string[]; createdAt: string }

const toAsset = (r: Record<string, any>): AssetRecord => ({
  id: r.id, kind: r.kind, title: r.title, blobSha: r.blob_sha, licenseSpdx: r.license_spdx, sourceUrl: r.source_url, author: r.author, attribution: r.attribution,
  licenseSnapshotSha: r.license_snapshot_sha, allowed: r.allowed, tags: r.tags ?? [], durationMs: r.duration_ms, createdAt: new Date(r.created_at).toISOString(),
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
