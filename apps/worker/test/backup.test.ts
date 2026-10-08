import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, type Config } from '@videogen/shared';
import { appendAudit, latestMaintenance } from '@videogen/db';
import { createTestDb, withDb } from '../../../packages/db/test/helpers.ts';
import { localDay, pruneBackups, takeBackup } from '../src/maintenance/backup.ts';
import { resolvePgDump, resolvePgRestore, type RunFn } from '../src/maintenance/pgdump.ts';
import { MaintenanceService } from '../src/maintenance/service.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const PASSWORD = 's3cret-Pw-77x';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const bin = mkdtempSync(join(tmpdir(), 'vg-pgbin-'));
function script(name: string, body: string): string {
  const f = join(bin, name);
  writeFileSync(f, `#!/bin/sh\n${body}\n`);
  chmodSync(f, 0o755);
  return f;
}
/** Runs a fake binary from `dir` only (PATH = dir): the resolver's probes never reach the host's tools. */
const runIn = (dir: string): RunFn => (file, args) => new Promise((res) => {
  execFile(file, args, { env: { PATH: dir } }, (err, stdout, stderr) => res({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout), stderr: String(stderr) }));
});
const cfgWith = (backup: Partial<Config['backup']>, adminDatabaseUrl = `postgres://videogen:${PASSWORD}@127.0.0.1:5433/vgx`): Config => {
  const base = loadConfig();
  return { ...base, adminDatabaseUrl, databaseUrl: 'postgres://videogen_app:apppw@127.0.0.1:5433/vgx', backup: { ...base.backup, pgDump: null, pgRestore: null, container: 'videogen-pg', ...backup } };
};
const auditOf = (pool: pg.Pool) => (action: string, data: Record<string, unknown>) => appendAudit(pool, { actorType: 'system', action, data }).then(() => {});

describe('backup', { timeout: 60_000 }, () => {
  it("resolvePgDump: VG_PG_DUMP wins; a host pg_dump of the server's major version is used with the owner URL; a mismatched host falls back to docker exec with -h localhost -p 5432 -U/-d and PGPASSWORD in the env, never in argv; neither gives the Turkish 'pg_dump 16, sunucu 17' reason; pg_restore resolves the same way", async () => {
    const d17 = mkdtempSync(join(tmpdir(), 'vg-pg17-'));
    const d16 = mkdtempSync(join(tmpdir(), 'vg-pg16-'));
    const dNone = mkdtempSync(join(tmpdir(), 'vg-pgno-'));
    for (const [dir, v] of [[d17, '17.2'], [d16, '16.15']] as const) {
      for (const tool of ['pg_dump', 'pg_restore']) { writeFileSync(join(dir, tool), `#!/bin/sh\necho "${tool} (PostgreSQL) ${v}"\n`); chmodSync(join(dir, tool), 0o755); }
    }
    // docker: only `docker exec <container> pg_* --version` answers (a 17 inside the container); in dNone docker exits 1.
    writeFileSync(join(d16, 'docker'), '#!/bin/sh\n[ "$1" = exec ] && [ "$2" = videogen-pg ] && echo "$3 (PostgreSQL) 17.11" && exit 0\nexit 1\n');
    writeFileSync(join(dNone, 'docker'), '#!/bin/sh\necho "Cannot connect to the Docker daemon" >&2\nexit 1\n');
    chmodSync(join(d16, 'docker'), 0o755); chmodSync(join(dNone, 'docker'), 0o755);
    writeFileSync(join(dNone, 'pg_dump'), '#!/bin/sh\necho "pg_dump (PostgreSQL) 16.15"\n'); chmodSync(join(dNone, 'pg_dump'), 0o755);

    const custom = await resolvePgDump({ config: cfgWith({ pgDump: ['/opt/pg17/bin/pg_dump', '--no-sync'] }), serverMajor: 17, run: runIn(dNone) });
    expect(custom).toEqual({ via: 'custom', argv: ['/opt/pg17/bin/pg_dump', '--no-sync', '-h', '127.0.0.1', '-p', '5433', '-U', 'videogen', '-d', 'vgx'], env: { PGPASSWORD: PASSWORD } });

    const host = await resolvePgDump({ config: cfgWith({}), serverMajor: 17, run: runIn(d17) });
    // The owner role from adminDatabaseUrl, not videogen_app (P3: the app role cannot read the drizzle schema).
    expect(host).toEqual({ via: 'host', argv: ['pg_dump', '-h', '127.0.0.1', '-p', '5433', '-U', 'videogen', '-d', 'vgx'], env: { PGPASSWORD: PASSWORD } });

    const docker = await resolvePgDump({ config: cfgWith({}), serverMajor: 17, run: runIn(d16) });
    expect(docker).toEqual({
      via: 'docker', env: { PGPASSWORD: PASSWORD },
      argv: ['docker', 'exec', '-i', '-e', 'PGPASSWORD', 'videogen-pg', 'pg_dump', '-h', 'localhost', '-p', '5432', '-U', 'videogen', '-d', 'vgx'],
    });
    for (const r of [custom, host, docker]) {
      if ('error' in r) throw new Error(r.error);
      expect(r.argv.join(' ')).not.toContain(PASSWORD);
      expect(r.argv.join(' ')).not.toContain('postgres://');
    }

    const none = await resolvePgDump({ config: cfgWith({}), serverMajor: 17, run: runIn(dNone) });
    expect(none).toEqual({ error: expect.stringContaining('pg_dump 16, sunucu 17') });
    expect((none as { error: string }).error).toContain('VG_PG_DUMP');
    expect((none as { error: string }).error).not.toContain(PASSWORD);
    const missing = await resolvePgDump({ config: cfgWith({}), serverMajor: 17, run: runIn(mkdtempSync(join(tmpdir(), 'vg-pgempty-'))) });
    expect(missing).toEqual({ error: expect.stringContaining('sunucu 17') });

    // pg_restore: the same order, its own override, the target database replaces the URL's.
    expect(await resolvePgRestore({ config: cfgWith({ pgRestore: ['/opt/pg17/bin/pg_restore'] }), serverMajor: 17, run: runIn(dNone), database: 'vg_new' }))
      .toEqual({ via: 'custom', argv: ['/opt/pg17/bin/pg_restore', '-h', '127.0.0.1', '-p', '5433', '-U', 'videogen', '-d', 'vg_new'], env: { PGPASSWORD: PASSWORD } });
    expect(await resolvePgRestore({ config: cfgWith({}), serverMajor: 17, run: runIn(d17), database: 'vg_new' }))
      .toMatchObject({ via: 'host', argv: ['pg_restore', '-h', '127.0.0.1', '-p', '5433', '-U', 'videogen', '-d', 'vg_new'] });
    expect(await resolvePgRestore({ config: cfgWith({}), serverMajor: 17, run: runIn(d16), database: 'vg_new' }))
      .toMatchObject({ via: 'docker', argv: ['docker', 'exec', '-i', '-e', 'PGPASSWORD', 'videogen-pg', 'pg_restore', '-h', 'localhost', '-p', '5432', '-U', 'videogen', '-d', 'vg_new'] });
    expect(await resolvePgRestore({ config: cfgWith({}), serverMajor: 17, run: runIn(dNone), database: 'vg_new' })).toEqual({ error: expect.stringContaining('VG_PG_RESTORE') });
  });

  it('backup round trip: the test database is dumped through the resolved command as the owner (the drizzle schema included), streamed to a 0600 file in a 0700 dir via .tmp + rename; bin/backup.mjs restore loads it into a new database where audit_verify is ok, the migration table and row counts match; restoring into an existing database exits 2', async () => {
    for (let i = 0; i < 3; i++) await appendAudit(t.pool, { actorType: 'system', action: 'test.backup', data: { i } });
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-bak-'));
    const config: Config = { ...loadConfig(), adminDatabaseUrl: t.adminUrl, dataDir };
    const r = await takeBackup({ pool: t.pool, dataDir, config }, Date.now());
    const dir = join(dataDir, 'backups');
    expect(r.file).toBe(join(dir, `videogen-${localDay(Date.now())}.dump`));
    expect(r.bytes).toBeGreaterThan(1000);
    expect(statSync(r.file).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(readdirSync(dir)).toEqual([`videogen-${localDay(Date.now())}.dump`]);
    expect(readFileSync(r.file).subarray(0, 5).toString()).toBe('PGDMP');

    const into = `vg_rt_${randomBytes(4).toString('hex')}`;
    const cli = (args: string[]) => new Promise<{ code: number; out: string; err: string }>((res) => {
      execFile(process.execPath, [join(ROOT, 'bin/backup.mjs'), ...args], { cwd: ROOT, env: { ...process.env, VG_ADMIN_DATABASE_URL: t.adminUrl, VG_DATA_DIR: dataDir }, timeout: 60_000 },
        (err, stdout, stderr) => res({ code: err ? Number(err.code ?? 1) : 0, out: String(stdout), err: String(stderr) }));
    });
    const restored = new pg.Client({ connectionString: withDb(t.adminUrl, into) });
    const src = new pg.Client({ connectionString: t.adminUrl });
    try {
      const ok = await cli(['restore', r.file, '--into', into]);
      expect(ok.err).toBe('');
      expect(ok.code).toBe(0);
      expect(ok.out).toMatch(/audit_verify: ok/);
      expect(ok.out).toMatch(/audit_log\s+\d+/);
      await restored.connect();
      await src.connect();
      expect((await restored.query('SELECT ok, checked FROM audit_verify()')).rows[0]).toMatchObject({ ok: true });
      const count = async (c: pg.Client, table: string) => Number((await c.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
      expect(await count(restored, 'drizzle.__drizzle_migrations')).toBe(await count(src, 'drizzle.__drizzle_migrations'));
      expect(await count(restored, 'drizzle.__drizzle_migrations')).toBeGreaterThan(9);
      for (const table of ['audit_log', 'settings', 'blobs', 'maintenance_runs']) expect(await count(restored, table)).toBe(await count(src, table));
      // The app role's grants came back with the dump (the role itself is cluster-wide).
      expect((await restored.query("SELECT has_table_privilege('videogen_app', 'audit_log', 'INSERT') AS i, has_table_privilege('videogen_app', 'maintenance_runs', 'DELETE') AS d")).rows[0]).toEqual({ i: true, d: false });

      const again = await cli(['restore', r.file, '--into', t.name]);
      expect(again.code).toBe(2);
      expect(again.err).toContain('zaten var');
      const bad = await cli(['restore', r.file, '--into', 'Bad-Name']);
      expect(bad.code).toBe(2);
      for (const o of [ok, again, bad]) expect(o.out + o.err).not.toMatch(/postgres:\/\//);
    } finally {
      await restored.end().catch(() => {});
      await src.end().catch(() => {});
      const a = new pg.Client({ connectionString: loadConfig().adminDatabaseUrl });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${into} WITH (FORCE)`);
      await a.end();
    }
  });

  it('rotation keeps the newest 7 dumps after a success and deletes none after a failure; backup.created / backup.failed / backup.pruned are audited without the password or the connection string', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-rot-'));
    const dir = join(dataDir, 'backups');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const old = Array.from({ length: 9 }, (_, i) => `videogen-2026-09-${String(10 + i).padStart(2, '0')}.dump`);
    for (const f of old) writeFileSync(join(dir, f), 'PGDMP old');
    writeFileSync(join(dir, 'notes.txt'), 'not a dump');
    const argsLog = join(bin, 'args.log');
    const good = script('fake_dump_ok', `echo "$@" > ${argsLog}\nprintf 'PGDMP fake archive'`);
    const failing = script('fake_dump_fail', `echo "pg_dump: error: connection to postgres://videogen:$PGPASSWORD@127.0.0.1:5433/vgx failed: password $PGPASSWORD" >&2\nexit 1`);
    const now = new Date(2026, 9, 8, 12, 0, 0).getTime();
    const svc = (pgDump: string[]) => new MaintenanceService({ pool: t.pool, dataDir, config: cfgWith({ pgDump, keep: 7 }), audit: auditOf(t.pool), clock: { now: () => now } });

    const since = Number((await t.pool.query('SELECT coalesce(max(seq), 0) AS s FROM audit_log')).rows[0].s);
    const failed = await svc([failing]).runNow('backup');
    expect(failed).toMatchObject({ status: 'failed' });
    expect(readdirSync(dir).sort()).toEqual([...old, 'notes.txt'].sort());

    const done = await svc([good]).runNow('backup');
    expect(done).toMatchObject({ status: 'done' });
    expect(readFileSync(argsLog, 'utf8')).not.toContain(PASSWORD);
    const today = `videogen-${localDay(now)}.dump`;
    expect(readdirSync(dir).sort()).toEqual([...old.slice(-6), today, 'notes.txt'].sort());
    expect(pruneBackups(dir, 7)).toEqual([]);

    const rows = (await t.pool.query('SELECT action, data FROM audit_log WHERE seq > $1 AND action LIKE $2 ORDER BY seq', [since, 'backup.%'])).rows;
    expect(rows.map((r) => r.action)).toEqual(['backup.failed', 'backup.created', 'backup.pruned']);
    expect(rows[0].data.reason).toContain('pg_dump');
    expect(rows[1].data).toMatchObject({ file: today, bytes: 18, via: 'custom' });
    expect(rows[2].data.files).toEqual(old.slice(0, 3));
    const text = JSON.stringify(rows);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain('postgres://');
    const runs = (await t.pool.query("SELECT status, detail FROM maintenance_runs WHERE kind = 'backup' ORDER BY started_at DESC LIMIT 2")).rows;
    expect(runs.map((r) => r.status)).toEqual(['done', 'failed']);
    expect(JSON.stringify(runs)).not.toContain(PASSWORD);
    const setting = (await t.pool.query("SELECT value FROM settings WHERE key = 'maintenance.backup'")).rows[0].value;
    expect(setting).toMatchObject({ status: 'done', file: today, via: 'custom', lastOk: { file: today } });
    expect(JSON.stringify(setting)).not.toContain(PASSWORD);
  });

  it('schedule: one backup per local day (a second tick the same day does nothing, the next day takes one); a half-finished running row is failed on recover with \'worker yeniden başladı\'; two runNow calls at once start one job', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-sched-'));
    const slow = script('fake_dump_slow', "sleep 0.3\nprintf 'PGDMP slow'");
    let now = new Date(2026, 9, 8, 12, 0, 0).getTime();
    const svc = new MaintenanceService({ pool: t.pool, dataDir, config: cfgWith({ pgDump: [slow] }), audit: auditOf(t.pool), clock: { now: () => now }, firstTickMs: 3_600_000 });
    const backups = async () => Number((await t.pool.query("SELECT count(*)::int AS n FROM maintenance_runs WHERE kind = 'backup'")).rows[0].n);

    const stale = (await t.pool.query("INSERT INTO maintenance_runs (id, kind, status) VALUES (gen_random_uuid(), 'gc_report', 'running') RETURNING id")).rows[0].id;
    expect(await svc.runNow('backup')).toBeNull(); // the other job's running row holds the single slot
    await svc.recover();
    try {
      const s = (await t.pool.query('SELECT status, ended_at, detail FROM maintenance_runs WHERE id = $1', [stale])).rows[0];
      expect(s.status).toBe('failed');
      expect(s.ended_at).not.toBeNull();
      expect(s.detail.error).toBe('worker yeniden başladı');

      const before = await backups();
      await svc.tick();
      expect(existsSync(join(dataDir, 'backups', `videogen-${localDay(now)}.dump`))).toBe(true);
      expect(await backups()).toBe(before + 1);
      await svc.tick();
      expect(await backups()).toBe(before + 1);
      now += 86_400_000;
      await svc.tick();
      expect(existsSync(join(dataDir, 'backups', `videogen-${localDay(now)}.dump`))).toBe(true);
      expect(await backups()).toBe(before + 2);

      const [a, b] = await Promise.all([svc.runNow('backup'), svc.runNow('backup')]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
      expect(await backups()).toBe(before + 3);
      expect(await latestMaintenance(t.pool, 'backup')).toMatchObject({ status: 'done' });
    } finally {
      svc.stop();
    }
  });
});
