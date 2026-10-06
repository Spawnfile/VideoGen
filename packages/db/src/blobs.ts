import type { Queryable } from './client.ts';

export interface BlobRow { sha256: string; path: string; bytes: number; mime: string }

/** True when the row is new; content-addressed, so an existing sha is left untouched. */
export async function insertBlob(db: Queryable, b: BlobRow): Promise<boolean> {
  const { rowCount } = await db.query('INSERT INTO blobs (sha256, path, bytes, mime) VALUES ($1, $2, $3, $4) ON CONFLICT (sha256) DO NOTHING', [b.sha256, b.path, b.bytes, b.mime]);
  return (rowCount ?? 0) > 0;
}
export async function getBlob(db: Queryable, sha256: string): Promise<BlobRow | null> {
  const { rows } = await db.query('SELECT sha256, path, bytes, mime FROM blobs WHERE sha256 = $1', [sha256]);
  return rows[0] ? { ...rows[0], bytes: Number(rows[0].bytes) } : null;
}
