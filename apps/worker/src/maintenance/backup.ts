import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, readdirSync, unlinkSync } from 'node:fs';
import { chmod, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable, Writable } from 'node:stream';
import pg from 'pg';
import { localDay, type Config } from '@videogen/shared';
import type { Queryable } from '@videogen/db';
import { killGroup } from '@videogen/claude';
import { childEnv, resolvePgDump, resolvePgRestore, scrub, type PgCommand, type PgVia, type RunFn } from './pgdump.ts';

const DUMP_RE = /^videogen-\d{4}-\d{2}-\d{2}\.dump$/;
const DB_NAME_RE = /^[a-z][a-z0-9_]{2,40}$/;
const STDERR_KEEP = 2048;
const DUMP_TIMEOUT_MS = 30 * 60_000;

export class BackupError extends Error {
  constructor(message: string, readonly exitCode = 1) { super(message); this.name = 'BackupError'; }
}

/** One dump file per local day (Y9); the helper moved to @videogen/shared for the trash folders (T7). */
export { localDay };

export const backupDir = (dataDir: string) => join(dataDir, 'backups');
export const backupFile = (dataDir: string, ms: number) => join(backupDir(dataDir), `videogen-${localDay(ms)}.dump`);

export async function serverMajor(db: Queryable): Promise<number> {
  const { rows } = await db.query("SELECT current_setting('server_version_num')::int / 10000 AS major");
  return Number(rows[0].major);
}

interface PgRun { code: number | null; stderr: string; timedOut: boolean; spawnError: string | null }

/**
 * Runs one pg_dump/pg_restore child as a process-group leader with a timeout. Binary stdout goes straight to `out` and stdin comes
 * from `input` (no line buffering, unlike `runProcess`); only the last 2 KB of stderr is kept.
 */
function runPg(cmd: PgCommand, io: { out?: Writable; input?: Readable; timeoutMs: number }): Promise<PgRun> {
  return new Promise((resolve) => {
    const child = spawn(cmd.argv[0]!, cmd.argv.slice(1), {
      env: childEnv(cmd.env), detached: true, stdio: [io.input ? 'pipe' : 'ignore', io.out ? 'pipe' : 'ignore', 'pipe'],
    });
    let stderr = '';
    let timedOut = false;
    let spawnError: string | null = null;
    child.stderr!.on('data', (d: Buffer) => { stderr = (stderr + d.toString('utf8')).slice(-STDERR_KEEP); });
    const piped: Promise<unknown>[] = [];
    if (io.out) piped.push(pipeline(child.stdout!, io.out).catch((e) => { spawnError ??= `yazılamadı (${(e as NodeJS.ErrnoException).code ?? 'hata'})`; }));
    if (io.input) piped.push(pipeline(io.input, child.stdin!).catch(() => { /* the child exited early; its exit code says why */ }));
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killGroup(child.pid, 'SIGTERM');
      setTimeout(() => { if (child.pid) killGroup(child.pid, 'SIGKILL'); }, 5_000).unref();
    }, io.timeoutMs);
    timer.unref();
    child.once('error', (e) => { spawnError = `başlatılamadı (${(e as NodeJS.ErrnoException).code ?? e.message})`; });
    child.once('close', (code) => {
      clearTimeout(timer);
      void Promise.all(piped).then(() => resolve({ code, stderr, timedOut, spawnError }));
    });
  });
}

function failure(tool: string, r: PgRun, password: string): string {
  const why = r.spawnError ?? (r.timedOut ? 'zaman aşımı' : `çıkış kodu ${r.code}`);
  const last = scrub(r.stderr.trim(), password).split('\n').slice(-3).join(' | ').slice(0, 500);
  return `${tool} ${why}${last ? `: ${last}` : ''}`;
}

const ownerPassword = (url: string) => decodeURIComponent(new URL(url).password);

export interface BackupDeps {
  /** Any connection to the server (the version probe); the dump itself runs as the owner from `config.adminDatabaseUrl`. */
  pool: Queryable;
  dataDir: string;
  config: Pick<Config, 'adminDatabaseUrl' | 'backup'>;
  run?: RunFn;
  timeoutMs?: number;
}
export interface BackupResult { file: string; bytes: number; ms: number; via: PgVia }

/** Y9 file rules: `<dataDir>/backups/videogen-<day>.dump` written as `.tmp` (0600, dir 0700), fsynced, then renamed. */
export async function takeBackup(d: BackupDeps, now: number): Promise<BackupResult> {
  const started = Date.now();
  const password = ownerPassword(d.config.adminDatabaseUrl);
  const cmd = await resolvePgDump({ config: d.config, serverMajor: await serverMajor(d.pool), run: d.run });
  if ('error' in cmd) throw new BackupError(cmd.error);
  const dir = backupDir(d.dataDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const file = backupFile(d.dataDir, now);
  const tmp = `${file}.tmp`;
  await rm(tmp, { force: true });
  try {
    const out = createWriteStream(tmp, { flags: 'wx', mode: 0o600, flush: true });
    const r = await runPg({ ...cmd, argv: [...cmd.argv, '-Fc', '-w'] }, { out, timeoutMs: d.timeoutMs ?? DUMP_TIMEOUT_MS });
    if (r.code !== 0 || r.timedOut || r.spawnError) throw new BackupError(failure('pg_dump', r, password));
    const { size } = await stat(tmp);
    if (size === 0) throw new BackupError('pg_dump boş çıktı verdi');
    await chmod(tmp, 0o600);
    await rename(tmp, file);
    const fd = await open(dir, 'r');
    try { await fd.sync(); } finally { await fd.close(); }
    return { file, bytes: size, ms: Date.now() - started, via: cmd.via };
  } catch (e) {
    await rm(tmp, { force: true });
    throw e instanceof BackupError ? e : new BackupError(`yedek yazılamadı (${(e as NodeJS.ErrnoException).code ?? (e as Error).name})`);
  }
}

/** Keeps the newest `keep` daily dumps (names sort by day); other files are left alone. Returns the deleted names. */
export function pruneBackups(dir: string, keep: number): string[] {
  let names: string[];
  try { names = readdirSync(dir).filter((f) => DUMP_RE.test(f)).sort(); } catch { return []; }
  const drop = names.slice(0, Math.max(0, names.length - keep));
  for (const f of drop) unlinkSync(join(dir, f));
  return drop;
}

export interface BackupListing { file: string; bytes: number; mtime: string }
export async function listBackups(dataDir: string): Promise<BackupListing[]> {
  const dir = backupDir(dataDir);
  let names: string[];
  try { names = readdirSync(dir).filter((f) => DUMP_RE.test(f)).sort().reverse(); } catch { return []; }
  return Promise.all(names.map(async (f) => { const s = await stat(join(dir, f)); return { file: f, bytes: s.size, mtime: s.mtime.toISOString() }; }));
}

export interface RestoreResult { database: string; via: PgVia; verify: { ok: boolean; checked: number; firstBadSeq: number | null }; counts: Record<string, number> }

const withDb = (url: string, db: string) => { const u = new URL(url); u.pathname = `/${db}`; return u.toString(); };

/**
 * Y9: loads a dump only into a database that does not exist yet (never over the live one): checks the name and the cluster's
 * `videogen_app` role (not in the dump), creates the database as the owner, pipes the archive into the resolved pg_restore, then reports
 * `audit_verify()` and every table's row count. Exit code 2 = refused before anything was created. A failed load drops the new database.
 */
export async function restoreBackup(o: { config: Pick<Config, 'adminDatabaseUrl' | 'backup'>; file: string; into: string; run?: RunFn; timeoutMs?: number }): Promise<RestoreResult> {
  if (!DB_NAME_RE.test(o.into)) throw new BackupError(`geçersiz veritabanı adı: ${o.into} (küçük harf, rakam ve _; 3–41 karakter, harfle başlar)`, 2);
  try { await stat(o.file); } catch { throw new BackupError(`yedek dosyası bulunamadı: ${basename(o.file)}`, 2); }
  const password = ownerPassword(o.config.adminDatabaseUrl);
  const admin = new pg.Client({ connectionString: o.config.adminDatabaseUrl });
  await admin.connect().catch((e) => { throw new BackupError(`Postgres'e bağlanılamadı (${(e as { code?: string }).code ?? (e as Error).name})`); });
  let created = false;
  try {
    if ((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [o.into])).rowCount) {
      throw new BackupError(`${o.into} veritabanı zaten var; geri yükleme yalnızca yeni bir veritabanına yapılır`, 2);
    }
    if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'videogen_app'")).rowCount) {
      throw new BackupError('videogen_app rolü bu kümede yok: önce boş bir veritabanında npm run db:migrate çalıştırın (rol dökümde değildir)', 2);
    }
    const cmd = await resolvePgRestore({ config: o.config, serverMajor: await serverMajor(admin), run: o.run, database: o.into });
    if ('error' in cmd) throw new BackupError(cmd.error, 2);
    await admin.query(`CREATE DATABASE ${o.into}`);
    created = true;
    const r = await runPg({ ...cmd, argv: [...cmd.argv, '-w', '--exit-on-error'] }, { input: createReadStream(o.file), timeoutMs: o.timeoutMs ?? DUMP_TIMEOUT_MS });
    if (r.code !== 0 || r.timedOut || r.spawnError) throw new BackupError(failure('pg_restore', r, password));
    const target = new pg.Client({ connectionString: withDb(o.config.adminDatabaseUrl, o.into) });
    await target.connect();
    try {
      const v = (await target.query('SELECT ok, checked, first_bad_seq FROM audit_verify()')).rows[0];
      const tables = (await target.query(
        "SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle') ORDER BY schemaname, tablename",
      )).rows as { schemaname: string; tablename: string }[];
      const counts: Record<string, number> = {};
      for (const t of tables) {
        const name = t.schemaname === 'public' ? t.tablename : `${t.schemaname}.${t.tablename}`;
        counts[name] = Number((await target.query(`SELECT count(*)::bigint AS n FROM "${t.schemaname}"."${t.tablename}"`)).rows[0].n);
      }
      return { database: o.into, via: cmd.via, verify: { ok: v.ok, checked: Number(v.checked), firstBadSeq: v.first_bad_seq === null ? null : Number(v.first_bad_seq) }, counts };
    } finally {
      await target.end().catch(() => {});
    }
  } catch (e) {
    if (created) await admin.query(`DROP DATABASE IF EXISTS ${o.into} WITH (FORCE)`).catch(() => {});
    if (e instanceof BackupError) throw e;
    throw new BackupError(scrub(`geri yükleme başarısız (${(e as { code?: string }).code ?? (e as Error).name})`, password));
  } finally {
    await admin.end().catch(() => {});
  }
}
