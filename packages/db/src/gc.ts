import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import {
  DAY_MS, GC_BACKUP_MAX_AGE_MS, GC_MIN_AGE_DAYS, GC_REPORT_MAX_AGE_MS, GC_REPORT_MAX_CANDIDATES, localDay, TRASH_KEEP_DAYS, type GcCandidate,
} from '@videogen/shared';
import { isUuid } from './agents.ts';
import { appendAudit } from './audit.ts';
import { BLOB_LOCK_NS, upsertBlob, withBlobLock, type Connectable } from './blobs.ts';
import type { Queryable } from './client.ts';
import { finishMaintenance, getMaintenance, latestMaintenance, startMaintenance } from './maintenance.ts';
import { mimeOf } from './media.ts';

/**
 * Plan M7 Y10: blob garbage collection. Lives in the db package (like putBlob) because the API runs the confirmed delete itself — the
 * request answers with the result or a Turkish 409 — while the worker makes the weekly report. Either way one `maintenance_runs` row at a
 * time, and every delete holds the blob's exclusive advisory lock (putBlob holds the shared one).
 */
export class GcRefused extends Error {
  constructor(message: string) { super(message); this.name = 'GcRefused'; }
}
export const GC_BUSY_TR = 'Başka bir bakım işi sürüyor; bitince yeniden deneyin.';
export const GC_NO_REPORT_TR = 'Rapor bulunamadı.';
export const GC_OLD_REPORT_TR = 'Rapor 24 saatten eski: yeni bir rapor oluşturun.';
export const GC_NO_BACKUP_TR = 'Son 24 saatte başarılı yedek yok: önce "Şimdi yedekle".';
export const gcWrongCountTr = (n: number) => `Onay sayısı tutmuyor: rapor ${n} aday içeriyor.`;

/** The text columns that hold a blob sha (two of them have no FK). blobs.sha256 is the key itself. */
export const REFERENCE_COLUMNS: readonly (readonly [table: string, column: string])[] = [
  ['artifacts', 'blob_sha'], ['assets', 'blob_sha'], ['assets', 'license_snapshot_sha'], ['agent_sessions', 'transcript_blob_sha'], ['publications', 'blob_sha'],
];
const NOT_A_REFERENCE = new Set(['blobs.sha256']);
/**
 * jsonb columns that are history, not references: audit rows (an import or a `blob.deleted` row would pin a blob forever) and the
 * maintenance reports themselves (a report's candidate list would protect its own candidates). Every other jsonb column of every table is
 * scanned, from information_schema, so a new table or column is covered without a code change.
 */
export const JSONB_NOT_REFERENCES = new Set(['audit_log.data', 'maintenance_runs.detail']);

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const ACTIVE_RUN_GUARD = `NOT EXISTS (SELECT 1 FROM runs r WHERE r.status IN ('queued', 'running') AND r.created_at <= b.touched_at)`;

/** Schema guard: text columns named *sha* that are neither a known reference nor the key. Non-empty → GC refuses. */
export async function unwiredShaColumns(db: Queryable): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name ILIKE '%sha%' AND data_type IN ('text', 'character varying', 'character')`,
  );
  const known = new Set([...REFERENCE_COLUMNS.map(([t, c]) => `${t}.${c}`), ...NOT_A_REFERENCE]);
  return rows.map((r) => `${r.table_name}.${r.column_name}`).filter((n) => !known.has(n)).sort();
}

async function jsonbColumns(db: Queryable): Promise<[string, string][]> {
  const { rows } = await db.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'jsonb' ORDER BY table_name, column_name",
  );
  return rows.map((r) => [r.table_name, r.column_name] as [string, string]).filter(([t, c]) => !JSONB_NOT_REFERENCES.has(`${t}.${c}`));
}

/**
 * The Y10 reference set: the five sha columns ∪ every 64-hex run found in the text of every jsonb value (a sha inside a path string
 * counts too: deliberately conservative). The 7-day `touched_at` window and active runs are applied to the candidates on top of this.
 */
export async function referencedShas(db: Queryable): Promise<Set<string>> {
  const out = new Set<string>();
  for (const [t, c] of REFERENCE_COLUMNS) {
    const { rows } = await db.query(`SELECT DISTINCT ${ident(c)} AS sha FROM ${ident(t)} WHERE ${ident(c)} IS NOT NULL`);
    for (const r of rows) out.add(r.sha);
  }
  for (const [t, c] of await jsonbColumns(db)) {
    const { rows } = await db.query(`SELECT DISTINCT m[1] AS sha FROM ${ident(t)}, regexp_matches(${ident(c)}::text, '([0-9a-f]{64})', 'g') AS m WHERE ${ident(c)} IS NOT NULL`);
    for (const r of rows) out.add(r.sha);
  }
  return out;
}

async function guard(db: Queryable): Promise<void> {
  const unwired = await unwiredShaColumns(db);
  if (unwired.length) throw new GcRefused(`Referans kümesine bağlanmamış sha sütunu: ${unwired.join(', ')}; çöp toplama durduruldu.`);
}

/** Old (untouched for 7 days), not touched since an active run was queued, and not referenced; the largest first. */
async function candidates(db: Queryable): Promise<GcCandidate[]> {
  const refs = await referencedShas(db);
  const { rows } = await db.query(
    `SELECT sha256, bytes, mime, created_at, touched_at FROM blobs b
     WHERE b.touched_at < now() - make_interval(days => $1) AND ${ACTIVE_RUN_GUARD} ORDER BY bytes DESC, sha256`,
    [GC_MIN_AGE_DAYS],
  );
  return rows.filter((r) => !refs.has(r.sha256)).map((r) => ({
    sha: r.sha256, bytes: Number(r.bytes), mime: r.mime, createdAt: new Date(r.created_at).toISOString(), touchedAt: new Date(r.touched_at).toISOString(),
  }));
}

export interface GcReport { id: string; candidates: GcCandidate[]; bytes: number }
type Actor = 'user' | 'system';

/** Y10 report: a `gc_report` row whose detail holds the candidate shas (≤ 10 000, largest first) and the 20 largest. Deletes nothing. */
export async function gcReport(d: { pool: Queryable; actor?: Actor }): Promise<GcReport> {
  const id = await startMaintenance(d.pool, 'gc_report');
  if (!id) throw new GcRefused(GC_BUSY_TR);
  try {
    await guard(d.pool);
    const all = await candidates(d.pool);
    const list = all.slice(0, GC_REPORT_MAX_CANDIDATES);
    const bytes = list.reduce((s, c) => s + c.bytes, 0);
    await finishMaintenance(d.pool, id, 'done', { count: list.length, bytes, candidates: list.map((c) => c.sha), top: list.slice(0, 20), more: all.length - list.length });
    await appendAudit(d.pool, { actorType: d.actor ?? 'system', action: 'gc.reported', subjectType: 'maintenance', subjectId: id, data: { count: list.length, bytes } });
    return { id, candidates: list, bytes };
  } catch (e) {
    const reason = e instanceof GcRefused ? e.message : `rapor oluşturulamadı (${(e as Error)?.name ?? 'hata'})`;
    await finishMaintenance(d.pool, id, 'failed', { error: reason }).catch(() => {});
    throw e;
  }
}

export const trashDir = (dataDir: string, day: string) => join(dataDir, 'trash', day);
export type DeleteOutcome = 'deleted' | 'referenced' | 'touched' | 'missing';

/**
 * One blob under its exclusive lock, in one transaction: the row goes only if it is still old and no active run started before its last
 * touch; an FK reference (23503) rolls back and skips. The file moves to `trash/<day>/` before COMMIT (and back if COMMIT fails), so a
 * putBlob waiting on the shared lock afterwards finds no row and no file and writes both.
 */
async function deleteOne(d: { pool: Connectable; dataDir: string; now?: number }, sha: string): Promise<{ outcome: DeleteOutcome; bytes: number }> {
  const c = await d.pool.connect();
  let moved = null as { from: string; to: string } | null;
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [BLOB_LOCK_NS, sha]);
    let row: { path: string; bytes: string } | undefined;
    try {
      row = (await c.query(
        `DELETE FROM blobs b WHERE b.sha256 = $1 AND b.touched_at < now() - make_interval(days => $2) AND ${ACTIVE_RUN_GUARD} RETURNING path, bytes`,
        [sha, GC_MIN_AGE_DAYS],
      )).rows[0];
    } catch (e) {
      if ((e as { code?: string }).code !== '23503') throw e;
      await c.query('ROLLBACK');
      return { outcome: 'referenced', bytes: 0 };
    }
    if (!row) {
      const still = (await c.query('SELECT 1 FROM blobs WHERE sha256 = $1', [sha])).rowCount === 1;
      await c.query('ROLLBACK');
      return { outcome: still ? 'touched' : 'missing', bytes: 0 };
    }
    const from = join(d.dataDir, row.path);
    const to = join(trashDir(d.dataDir, localDay(d.now ?? Date.now())), basename(row.path));
    await mkdir(dirname(to), { recursive: true });
    try {
      await rename(from, to);
      moved = { from, to };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // a db-only row (file already gone) is still deleted
    }
    await c.query('COMMIT');
    return { outcome: 'deleted', bytes: Number(row.bytes) };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    if (moved) await rename(moved.to, moved.from).catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function deleteBlob(d: { pool: Connectable; dataDir: string; now?: number }, sha: string): Promise<DeleteOutcome> {
  return (await deleteOne(d, sha)).outcome;
}

export interface GcDeleteResult { deleted: number; skipped: number; bytes: number }

/**
 * Y10 confirmed delete. Refused (GcRefused, Turkish) unless: the report exists and is ≤ 24 h old, a backup succeeded in the last 24 h,
 * `confirm` equals the report's candidate count, the schema guard passes and no other maintenance job runs. Each candidate is re-checked
 * against a fresh reference set, then deleted under its lock (FK violation, a fresh touch or an active run → skipped). `blob.deleted` is
 * audited per group of `auditGroup` (500) deletions.
 */
export async function gcDelete(
  d: { pool: Connectable; dataDir: string; actor?: Actor; now?: number; auditGroup?: number },
  req: { reportId: string; confirm: string | number },
): Promise<GcDeleteResult> {
  const now = d.now ?? Date.now();
  const report = isUuid(req.reportId) ? await getMaintenance(d.pool, req.reportId) : null;
  if (!report || report.kind !== 'gc_report' || report.status !== 'done') throw new GcRefused(GC_NO_REPORT_TR);
  if (now - Date.parse(report.startedAt) > GC_REPORT_MAX_AGE_MS) throw new GcRefused(GC_OLD_REPORT_TR);
  const backup = await latestMaintenance(d.pool, 'backup', ['done']);
  if (!backup || now - Date.parse(backup.endedAt ?? backup.startedAt) > GC_BACKUP_MAX_AGE_MS) throw new GcRefused(GC_NO_BACKUP_TR);
  const shas = Array.isArray(report.detail?.candidates) ? (report.detail.candidates as unknown[]).filter((s): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)) : [];
  if (String(req.confirm).trim() !== String(shas.length)) throw new GcRefused(gcWrongCountTr(shas.length));
  await guard(d.pool);
  const id = await startMaintenance(d.pool, 'gc_delete');
  if (!id) throw new GcRefused(GC_BUSY_TR);
  const groupSize = Math.max(1, d.auditGroup ?? 500);
  const out: GcDeleteResult = { deleted: 0, skipped: 0, bytes: 0 };
  let group: { sha: string; bytes: number }[] = [];
  const flush = async () => {
    if (!group.length) return;
    const g = group;
    group = [];
    await appendAudit(d.pool, {
      actorType: d.actor ?? 'user', action: 'blob.deleted', subjectType: 'maintenance', subjectId: report.id,
      data: { count: g.length, bytes: g.reduce((s, x) => s + x.bytes, 0), reportId: report.id, shas: g.map((x) => x.sha) },
    });
  };
  try {
    const refs = await referencedShas(d.pool);
    for (const sha of shas) {
      if (refs.has(sha)) { out.skipped++; continue; }
      const r = await deleteOne({ pool: d.pool, dataDir: d.dataDir, now }, sha);
      if (r.outcome !== 'deleted') { out.skipped++; continue; }
      out.deleted++;
      out.bytes += r.bytes;
      group.push({ sha, bytes: r.bytes });
      if (group.length >= groupSize) await flush();
    }
    await flush();
    await finishMaintenance(d.pool, id, 'done', { reportId: report.id, ...out });
    return out;
  } catch (e) {
    await flush().catch(() => {});
    await finishMaintenance(d.pool, id, 'failed', { reportId: report.id, ...out, error: `silme yarıda kaldı (${(e as Error)?.name ?? 'hata'})` }).catch(() => {});
    throw e;
  }
}

const DAY_DIR = /^\d{4}-\d{2}-\d{2}$/;

async function countFiles(dir: string): Promise<number> {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) n += e.isDirectory() ? await countFiles(join(dir, e.name)) : 1;
  return n;
}

/** Y10: day folders of the trash older than `days` (by name, local days) are removed for good; other entries are left alone. */
export async function purgeTrash(dataDir: string, now: number, days = TRASH_KEEP_DAYS): Promise<{ dirs: string[]; files: number }> {
  const root = join(dataDir, 'trash');
  const cutoff = localDay(now - days * DAY_MS);
  const dirs: string[] = [];
  let files = 0;
  for (const e of (await readdir(root, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory() || !DAY_DIR.test(e.name) || e.name >= cutoff) continue;
    files += await countFiles(join(root, e.name));
    await rm(join(root, e.name), { recursive: true, force: true });
    dirs.push(e.name);
  }
  return { dirs, files };
}

async function sha256File(p: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(p)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/**
 * `bin/maintenance.mjs restore-blob <sha>`: the newest trashed copy goes back to its media path (content checked against the sha) and
 * the row is re-inserted with a fresh `touched_at`, under the blob's exclusive lock. Audited `blob.restored`.
 */
export async function restoreBlob(d: { pool: Connectable; dataDir: string; actor?: Actor }, sha: string): Promise<{ sha256: string; path: string; bytes: number; mime: string; from: string }> {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new GcRefused('Geçersiz sha.');
  const root = join(d.dataDir, 'trash');
  let found: { day: string; name: string } | null = null;
  for (const day of (await readdir(root).catch(() => [] as string[])).filter((n) => DAY_DIR.test(n)).sort().reverse()) {
    const name = (await readdir(join(root, day)).catch(() => [] as string[])).find((n) => n === sha || (n.startsWith(sha) && n[64] === '.'));
    if (name) { found = { day, name }; break; }
  }
  if (!found) throw new GcRefused(`${sha} çöp kutusunda yok.`);
  const src = join(root, found.day, found.name);
  if ((await sha256File(src)) !== sha) throw new GcRefused(`${found.name}: içerik sha ile tutmuyor; geri yüklenmedi.`);
  const ext = extname(found.name).toLowerCase();
  const rel = join('media', 'sha256', sha.slice(0, 2), sha.slice(2, 4), `${sha}${ext}`);
  const bytes = (await stat(src)).size;
  const mime = mimeOf(ext);
  const r = await withBlobLock(d.pool, sha, 'exclusive', async (c) => {
    const row = await upsertBlob(c, { sha256: sha, path: rel, bytes, mime });
    const dest = join(d.dataDir, row.path);
    if (await stat(dest).then(() => true, () => false)) await rm(src, { force: true }); // already rewritten by a putBlob
    else { await mkdir(dirname(dest), { recursive: true }); await rename(src, dest); }
    return { sha256: sha, path: row.path, bytes, mime, from: found.day };
  });
  await appendAudit(d.pool, { actorType: d.actor ?? 'user', action: 'blob.restored', data: { sha256: sha, path: r.path, bytes, from: found.day } });
  return r;
}
