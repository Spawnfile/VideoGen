import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type pg from 'pg';
import { UPLOAD_MAX_AGE_MS } from '@videogen/shared';
import { appendAudit, finishMaintenance, GC_BUSY_TR, GcRefused, isUuid, startMaintenance } from '@videogen/db';

const SAMPLE = 50;

export interface OrphanReport { diskOnly: string[]; dbOnly: string[]; sizeMismatch: string[]; strayRunDirs: string[]; uploadsRemoved: number }

/** Plan M7 Y8/Y10: `<dataDir>/uploads/*` older than 1 h are upload leftovers (not user files) and are removed. Returns the count. */
export async function sweepUploads(dataDir: string, now: number, maxAgeMs = UPLOAD_MAX_AGE_MS): Promise<number> {
  const dir = join(dataDir, 'uploads');
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!e.isFile()) continue;
    const f = join(dir, e.name);
    const s = await stat(f).catch(() => null);
    if (s && now - s.mtimeMs > maxAgeMs) { await rm(f, { force: true }); n++; }
  }
  return n;
}

async function walk(dir: string, out: string[]): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && !e.name.endsWith('.tmp')) out.push(p); // .tmp = a putBlob in flight
  }
}

/** `runs/<uuid>` needs a runs row; `runs/adhoc-<uuid>` (a session without a run) an agent_sessions row; anything else is stray. */
async function strayRunDirs(pool: pg.Pool, dataDir: string): Promise<string[]> {
  const names = (await readdir(join(dataDir, 'runs'), { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name);
  const runIds = names.filter(isUuid);
  const sessionIds = names.filter((n) => n.startsWith('adhoc-') && isUuid(n.slice(6))).map((n) => n.slice(6));
  const runs = new Set((await pool.query('SELECT id::text FROM runs WHERE id = ANY($1::uuid[])', [runIds])).rows.map((r) => r.id));
  const sessions = new Set((await pool.query('SELECT id::text FROM agent_sessions WHERE id = ANY($1::uuid[])', [sessionIds])).rows.map((r) => r.id));
  return names.filter((n) => (isUuid(n) ? !runs.has(n) : !(n.startsWith('adhoc-') && sessions.has(n.slice(6))))).map((n) => join('runs', n)).sort();
}

/**
 * Plan M7 Y10 orphan report (never deletes media or run folders): media files on disk without their blobs row, rows whose file is gone
 * or has another size, and run folders without their row. Upload leftovers older than 1 h are the one thing removed. One maintenance job.
 */
export async function orphanReport(d: { pool: pg.Pool; dataDir: string; now?: number; actor?: 'user' | 'system' }): Promise<OrphanReport> {
  const id = await startMaintenance(d.pool, 'orphan_report');
  if (!id) throw new GcRefused(GC_BUSY_TR);
  try {
    const uploadsRemoved = await sweepUploads(d.dataDir, d.now ?? Date.now());
    const rows = (await d.pool.query('SELECT sha256, path, bytes FROM blobs')).rows as { sha256: string; path: string; bytes: string }[];
    const known = new Set(rows.map((r) => r.path));
    const files: string[] = [];
    await walk(join(d.dataDir, 'media'), files);
    const diskOnly = files.map((f) => relative(d.dataDir, f)).filter((p) => !known.has(p)).sort();
    const dbOnly: string[] = [];
    const sizeMismatch: string[] = [];
    for (const r of rows) {
      const s = await stat(join(d.dataDir, r.path)).catch(() => null);
      if (!s) dbOnly.push(r.sha256);
      else if (s.size !== Number(r.bytes)) sizeMismatch.push(r.sha256);
    }
    dbOnly.sort();
    sizeMismatch.sort();
    const stray = await strayRunDirs(d.pool, d.dataDir);
    const out: OrphanReport = { diskOnly, dbOnly, sizeMismatch, strayRunDirs: stray, uploadsRemoved };
    const counts = { diskOnly: diskOnly.length, dbOnly: dbOnly.length, sizeMismatch: sizeMismatch.length, strayRunDirs: stray.length, uploadsRemoved };
    await finishMaintenance(d.pool, id, 'done', {
      ...counts, samples: { diskOnly: diskOnly.slice(0, SAMPLE), dbOnly: dbOnly.slice(0, SAMPLE), sizeMismatch: sizeMismatch.slice(0, SAMPLE), strayRunDirs: stray.slice(0, SAMPLE) },
    });
    await appendAudit(d.pool, { actorType: d.actor ?? 'system', action: 'orphans.reported', subjectType: 'maintenance', subjectId: id, data: counts });
    return out;
  } catch (e) {
    await finishMaintenance(d.pool, id, 'failed', { error: `yetim raporu oluşturulamadı (${(e as Error)?.name ?? 'hata'})` }).catch(() => {});
    throw e;
  }
}
