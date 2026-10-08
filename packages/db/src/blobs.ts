import type pg from 'pg';
import type { Queryable } from './client.ts';

export interface BlobRow { sha256: string; path: string; bytes: number; mime: string }
/** A pool (or anything that hands out a client for one transaction): the per-blob advisory locks are transaction-scoped. */
export type Connectable = Pick<pg.Pool, 'query' | 'connect'>;

/**
 * Plan M7 Y10: per-blob advisory locks in their own two-key namespace ("VB"; the second key is `hashtext(sha)`), so they never meet the
 * fixed `VG_LOCK_NS` keys (publish limit, TikTok tokens/rate, test template). putBlob takes the shared lock, the GC delete and restore-blob
 * the exclusive one; a hashtext collision between two shas only serializes them.
 */
export const BLOB_LOCK_NS = 0x5642; // "VB"

/** Runs `fn` in one transaction holding the blob's advisory lock (released at COMMIT/ROLLBACK). */
export async function withBlobLock<T>(pool: Connectable, sha256: string, mode: 'shared' | 'exclusive', fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(mode === 'shared' ? 'SELECT pg_advisory_xact_lock_shared($1, hashtext($2))' : 'SELECT pg_advisory_xact_lock($1, hashtext($2))', [BLOB_LOCK_NS, sha256]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** True when the row is new; content-addressed, so an existing sha is left untouched. */
export async function insertBlob(db: Queryable, b: BlobRow): Promise<boolean> {
  const { rowCount } = await db.query('INSERT INTO blobs (sha256, path, bytes, mime) VALUES ($1, $2, $3, $4) ON CONFLICT (sha256) DO NOTHING', [b.sha256, b.path, b.bytes, b.mime]);
  return (rowCount ?? 0) > 0;
}

/**
 * Plan M7 Y10: insert, or refresh `touched_at` of the existing row (its path, bytes and mime stay: content-addressed). Returns the stored
 * path, which is where the file must be. Called under the blob's shared lock (putBlob, restore).
 */
export async function upsertBlob(db: Queryable, b: BlobRow): Promise<{ created: boolean; path: string }> {
  const { rows } = await db.query(
    `INSERT INTO blobs (sha256, path, bytes, mime) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sha256) DO UPDATE SET touched_at = now() RETURNING path, (xmax = 0) AS created`,
    [b.sha256, b.path, b.bytes, b.mime],
  );
  return { created: rows[0].created === true, path: rows[0].path };
}

export async function getBlob(db: Queryable, sha256: string): Promise<BlobRow | null> {
  const { rows } = await db.query('SELECT sha256, path, bytes, mime FROM blobs WHERE sha256 = $1', [sha256]);
  return rows[0] ? { ...rows[0], bytes: Number(rows[0].bytes) } : null;
}
