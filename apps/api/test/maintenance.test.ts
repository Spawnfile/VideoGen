import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { finishMaintenance, gcReport, putBlob, startMaintenance } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

const H = { host: '127.0.0.1:5180' };
const EVIL = { ...H, origin: 'http://evil.example' };
let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
let listener: pg.Client;
const commands: Record<string, unknown>[] = [];
const dataDir = mkdtempSync(join(tmpdir(), 'vg-api-maint-'));

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', dataDir } });
  listener = new pg.Client({ connectionString: t.appUrl });
  await listener.connect();
  listener.on('notification', (n) => { if (n.channel === 'vg_commands') commands.push(JSON.parse(n.payload!)); });
  await listener.query('LISTEN vg_commands');
});
afterAll(async () => { await listener.end(); await app.close(); await hub.stop(); await t.drop(); rmSync(dataDir, { recursive: true, force: true }); });

const post = (url: string, payload: object = {}, headers: Record<string, string> = H) => app.inject({ method: 'POST', url, headers, payload });
const settle = () => new Promise((r) => setTimeout(r, 50));
async function oldBlob(days = 30) {
  const src = join(dataDir, `src-${randomBytes(6).toString('hex')}.bin`);
  writeFileSync(src, `api blob ${randomBytes(16).toString('hex')}`);
  const b = await putBlob(t.pool, dataDir, src);
  await t.pool.query('UPDATE blobs SET touched_at = now() - make_interval(days => $2) WHERE sha256 = $1', [b.sha256, days]);
  return b;
}
async function job(kind: 'backup' | 'gc_report' | 'orphan_report', status: 'done' | 'failed', detail: Record<string, unknown>, hoursAgo = 0) {
  const id = (await startMaintenance(t.pool, kind))!;
  await finishMaintenance(t.pool, id, status, detail);
  if (hoursAgo) await t.pool.query('UPDATE maintenance_runs SET started_at = started_at - make_interval(hours => $2), ended_at = ended_at - make_interval(hours => $2) WHERE id = $1', [id, hoursAgo]);
  return id;
}

describe('maintenance endpoints (plan M7 T7)', () => {
  it('GET /api/maintenance reports the data dir, free disk, db and media sizes, the last backup and the latest reports; POST backup / gc-report / orphans send maintenance.run and return 202; a non-local Origin is refused', async () => {
    const empty = (await app.inject({ method: 'GET', url: '/api/maintenance', headers: H })).json();
    expect(empty).toMatchObject({ dataDir, gc: null, orphans: null, running: null, backup: { lastAt: null, ok: null, lastOkAt: null, count: 0 } });
    expect(empty.diskFreeMb).toBeGreaterThan(0);
    expect(empty.dbBytes).toBeGreaterThan(1_000_000);

    const b = await oldBlob();
    mkdirSync(join(dataDir, 'backups'), { recursive: true });
    for (const d of ['2026-10-07', '2026-10-08']) writeFileSync(join(dataDir, 'backups', `videogen-${d}.dump`), 'PGDMP');
    writeFileSync(join(dataDir, 'backups', 'notes.txt'), 'x');
    await job('backup', 'done', { file: 'videogen-2026-10-07.dump', bytes: 1234, ms: 5, via: 'docker' }, 30);
    await job('backup', 'failed', { error: 'pg_dump 16, sunucu 17: VG_PG_DUMP ayarlayın' });
    const rep = await gcReport({ pool: t.pool });
    await job('orphan_report', 'done', { diskOnly: 2, dbOnly: 1, sizeMismatch: 0, strayRunDirs: 1, uploadsRemoved: 3, samples: { diskOnly: ['media/a', 'media/b'], dbOnly: ['c'], sizeMismatch: [], strayRunDirs: ['runs/x'] } });

    const m = (await app.inject({ method: 'GET', url: '/api/maintenance', headers: H })).json();
    expect(m.mediaBytes).toBe(b.bytes);
    expect(m.backup).toMatchObject({ ok: false, error: 'pg_dump 16, sunucu 17: VG_PG_DUMP ayarlayın', bytes: 1234, via: 'docker', count: 2 });
    expect(Date.now() - Date.parse(m.backup.lastOkAt)).toBeGreaterThan(29 * 3_600_000);
    expect(Date.parse(m.backup.lastAt)).toBeGreaterThan(Date.parse(m.backup.lastOkAt));
    expect(m.gc).toMatchObject({ reportId: rep.id, candidates: 1, bytes: b.bytes, top: [{ sha: b.sha256, bytes: b.bytes }], lastDelete: null });
    expect(m.orphans).toMatchObject({ diskOnly: 2, dbOnly: 1, sizeMismatch: 0, strayRunDirs: 1, uploadsRemoved: 3, samples: { diskOnly: ['media/a', 'media/b'] } });

    commands.length = 0;
    for (const [path, kind] of [['backup', 'backup'], ['gc-report', 'gc_report'], ['orphans', 'orphan_report']] as const) {
      const r = await post(`/api/maintenance/${path}`);
      expect(r.statusCode).toBe(202);
      expect(r.json()).toEqual({ accepted: true, kind });
    }
    await settle();
    expect(commands).toEqual([{ type: 'maintenance.run', kind: 'backup' }, { type: 'maintenance.run', kind: 'gc_report' }, { type: 'maintenance.run', kind: 'orphan_report' }]);
    const audits = (await t.pool.query("SELECT data FROM audit_log WHERE action = 'maintenance.requested' ORDER BY seq")).rows.map((r) => r.data.kind);
    expect(audits).toEqual(['backup', 'gc_report', 'orphan_report']);

    commands.length = 0;
    for (const path of ['backup', 'gc-report', 'orphans', 'gc']) expect((await post(`/api/maintenance/${path}`, { reportId: rep.id, confirm: '1' }, EVIL)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/maintenance', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    await settle();
    expect(commands).toEqual([]);
    expect(existsSync(join(dataDir, b.path))).toBe(true);

    const running = (await startMaintenance(t.pool, 'gc_report'))!;
    expect((await app.inject({ method: 'GET', url: '/api/maintenance', headers: H })).json().running).toBe('gc_report');
    await finishMaintenance(t.pool, running, 'failed', { error: 'test' });
  });

  it('POST /api/maintenance/gc returns the Turkish 409 reasons (old report, no backup, wrong count, a job running) and deletes with a valid confirm', async () => {
    await t.pool.query("UPDATE maintenance_runs SET started_at = started_at - interval '48 hours', ended_at = ended_at - interval '48 hours' WHERE kind = 'backup'");
    const a = await oldBlob();
    const c = await oldBlob();
    const rep = await gcReport({ pool: t.pool });
    const n = String(rep.candidates.length);
    expect(rep.candidates.map((x) => x.sha)).toEqual(expect.arrayContaining([a.sha256, c.sha256]));
    const gc = (body: object) => post('/api/maintenance/gc', body);

    expect((await gc({})).statusCode).toBe(400);
    expect((await gc({ reportId: 'nope', confirm: n })).statusCode).toBe(400);
    const noBackup = await gc({ reportId: rep.id, confirm: n });
    expect(noBackup.statusCode).toBe(409);
    expect(noBackup.json().error).toBe('Son 24 saatte başarılı yedek yok: önce "Şimdi yedekle".');
    await job('backup', 'done', { file: 'videogen-2026-10-08.dump', bytes: 10, via: 'host' });
    const wrong = await gc({ reportId: rep.id, confirm: '999' });
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json().error).toBe(`Onay sayısı tutmuyor: rapor ${n} aday içeriyor.`);
    const busy = (await startMaintenance(t.pool, 'orphan_report'))!;
    const running = await gc({ reportId: rep.id, confirm: n });
    expect(running.statusCode).toBe(409);
    expect(running.json().error).toBe('Başka bir bakım işi sürüyor; bitince yeniden deneyin.');
    await finishMaintenance(t.pool, busy, 'done', {});
    await t.pool.query("UPDATE maintenance_runs SET started_at = started_at - interval '25 hours' WHERE id = $1", [rep.id]);
    const old = await gc({ reportId: rep.id, confirm: n });
    expect(old.statusCode).toBe(409);
    expect(old.json().error).toBe('Rapor 24 saatten eski: yeni bir rapor oluşturun.');
    expect(existsSync(join(dataDir, a.path))).toBe(true);

    const rep2 = await gcReport({ pool: t.pool });
    const ok = await gc({ reportId: rep2.id, confirm: String(rep2.candidates.length) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ deleted: rep2.candidates.length, skipped: 0, bytes: rep2.bytes });
    expect(existsSync(join(dataDir, a.path))).toBe(false);
    expect((await t.pool.query('SELECT count(*)::int AS n FROM blobs WHERE sha256 = ANY($1)', [[a.sha256, c.sha256]])).rows[0].n).toBe(0);
    const audit = (await t.pool.query("SELECT actor_type, data FROM audit_log WHERE action = 'blob.deleted'")).rows;
    expect(audit).toEqual([{ actor_type: 'user', data: expect.objectContaining({ count: rep2.candidates.length, reportId: rep2.id }) }]);
    const m = (await app.inject({ method: 'GET', url: '/api/maintenance', headers: H })).json();
    expect(m.gc.lastDelete).toMatchObject({ reportId: rep2.id, deleted: rep2.candidates.length, skipped: 0, ok: true });
  });
});
