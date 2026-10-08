import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, producePlan, type Config } from '@videogen/shared';
import { appendAudit, createProduceRun, finishMaintenance, insertArtifact, insertAsset, putBlob, startMaintenance } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { deleteBlob, gcDelete, GcRefused, gcReport, referencedShas, unwiredShaColumns, withBlobLock } from '../src/maintenance/gc.ts';
import { orphanReport } from '../src/maintenance/orphans.ts';
import { purgeTrash, restoreBlob } from '../src/maintenance/trash.ts';
import { localDay } from '../src/maintenance/backup.ts';
import { MaintenanceService } from '../src/maintenance/service.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const DAY = 86_400_000;
type Db = Awaited<ReturnType<typeof createTestDb>>;
const dbs: Db[] = [];
afterEach(async () => { for (const d of dbs.splice(0)) await d.drop(); });
const fresh = async () => { const d = await createTestDb(); dbs.push(d); return d; };

/** A unique file stored through putBlob, then aged by `ageDays` (touched_at moved back). */
async function blob(t: Db, dataDir: string, ageDays: number, ext = '.bin', body?: string) {
  const src = join(dataDir, `src-${randomBytes(6).toString('hex')}${ext}`);
  writeFileSync(src, body ?? `blob ${randomBytes(12).toString('hex')}`);
  const b = await putBlob(t.pool, dataDir, src);
  await age(t, b.sha256, ageDays);
  return { ...b, src };
}
const age = (t: Db, sha: string, days: number) => t.pool.query(`UPDATE blobs SET touched_at = now() - make_interval(days => $2) WHERE sha256 = $1`, [sha, days]);
const freshBackup = async (t: Db, hoursAgo = 1) => {
  const id = (await startMaintenance(t.pool, 'backup'))!;
  await finishMaintenance(t.pool, id, 'done', { file: 'videogen-x.dump', bytes: 10, via: 'custom' });
  await t.pool.query(`UPDATE maintenance_runs SET started_at = now() - make_interval(hours => $2), ended_at = now() - make_interval(hours => $2) WHERE id = $1`, [id, hoursAgo]);
};
const rowExists = async (t: Db, sha: string) => (await t.pool.query('SELECT 1 FROM blobs WHERE sha256 = $1', [sha])).rowCount === 1;
const run = async (t: Db, status = 'done') => {
  const r = await createProduceRun(t.pool, { productName: `ürün ${randomBytes(3).toString('hex')}`, audioMode: 'silent', plan: producePlan('silent') });
  await t.pool.query('UPDATE runs SET status = $2 WHERE id = $1', [r.runId, status]);
  return r;
};

describe('blob GC and orphan report (plan M7 T7)', { timeout: 60_000 }, () => {
  it('gc report: a blob referenced only by artifacts.meta (glbSha, stemSha, voiceStemSha, musicSha), by any other jsonb column, by a transcript, a publication, an asset or its license text, by an active run, or touched in the last 7 days is never a candidate; an old unreferenced blob is; a new *sha* text column not wired into the reference set fails the schema guard', async () => {
    const t = await fresh();
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-gc-'));
    const r = await run(t);
    const meta: Record<string, string> = {};
    for (const k of ['glbSha', 'stemSha', 'voiceStemSha', 'musicSha']) meta[k] = (await blob(t, dataDir, 30)).sha256;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene_plan', meta: { nested: { ...meta } } });
    const inContent = (await blob(t, dataDir, 30)).sha256;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'storyboard', content: { frames: [{ path: `media/sha256/x/y/${inContent}.png` }] } });
    const inSettings = (await blob(t, dataDir, 30)).sha256;
    await t.pool.query("INSERT INTO settings (key, value) VALUES ('test.ref', $1)", [JSON.stringify({ deep: [{ sha: inSettings }] })]);
    // A table added later: the jsonb column list comes from information_schema, not from a hand-written list.
    const inNewTable = (await blob(t, dataDir, 30)).sha256;
    const admin = new pg.Client({ connectionString: t.adminUrl });
    await admin.connect();
    try {
      await admin.query('CREATE TABLE vg_extra (id int, j jsonb)');
      await admin.query('GRANT SELECT ON vg_extra TO videogen_app');
      await admin.query('INSERT INTO vg_extra VALUES (1, $1)', [JSON.stringify({ k: inNewTable })]);
      const transcript = (await blob(t, dataDir, 30, '.gz')).sha256;
      await t.pool.query(
        `INSERT INTO agent_sessions (id, kind, role, model, effort, status, claude_session_id, run_dir, transcript_blob_sha) VALUES ($1, 'pipeline', 'researcher', 'sonnet', 'low', 'done', $2, '/tmp/x', $3)`,
        [randomUUID(), randomUUID(), transcript],
      );
      const published = (await blob(t, dataDir, 30, '.mp4')).sha256;
      await t.pool.query(
        `INSERT INTO publications (id, video_id, version_id, variant, status, blob_sha, bytes, caption, aigc_required) VALUES ($1, $2, $3, 'tiktok', 'failed', $4, 1, 'c', false)`,
        [randomUUID(), r.videoId, r.versionId, published],
      );
      const music = (await blob(t, dataDir, 30, '.wav')).sha256;
      const license = (await blob(t, dataDir, 30, '.txt')).sha256;
      await insertAsset(t.pool, { kind: 'music', title: 'M', blobSha: music, licenseSpdx: 'CC0-1.0', author: 'A', allowed: true, licenseSnapshotSha: license });
      // An active run: blobs touched since it was queued belong to it (the artifact row may not exist yet).
      const active = await run(t, 'running');
      await t.pool.query("UPDATE runs SET created_at = now() - interval '20 days', started_at = now() - interval '20 days' WHERE id = $1", [active.runId]);
      const ofActiveRun = (await blob(t, dataDir, 10)).sha256;
      const recent = (await blob(t, dataDir, 2)).sha256;
      const old = await blob(t, dataDir, 30);
      const oldToo = await blob(t, dataDir, 25, '.png');
      // History is not a reference: an audit row that mentions a sha does not pin it.
      const onlyAudited = await blob(t, dataDir, 40);
      await appendAudit(t.pool, { actorType: 'system', action: 'test.mention', data: { sha256: onlyAudited.sha256 } });

      const refs = await referencedShas(t.pool);
      for (const s of [...Object.values(meta), inContent, inSettings, inNewTable, transcript, published, music, license]) expect(refs.has(s)).toBe(true);
      expect(refs.has(old.sha256)).toBe(false);

      const rep = await gcReport({ pool: t.pool });
      const shas = rep.candidates.map((c) => c.sha);
      expect(shas.sort()).toEqual([old.sha256, oldToo.sha256, onlyAudited.sha256].sort());
      for (const s of [...Object.values(meta), inContent, inSettings, inNewTable, transcript, published, music, license, ofActiveRun, recent]) expect(shas).not.toContain(s);
      expect(rep.bytes).toBe(old.bytes + oldToo.bytes + onlyAudited.bytes);
      expect(rep.candidates[0]).toMatchObject({ mime: expect.any(String), bytes: expect.any(Number), createdAt: expect.any(String), touchedAt: expect.any(String) });
      const row = (await t.pool.query('SELECT kind, status, detail FROM maintenance_runs WHERE id = $1', [rep.id])).rows[0];
      expect(row).toMatchObject({ kind: 'gc_report', status: 'done', detail: { count: 3, bytes: rep.bytes } });
      expect([...row.detail.candidates].sort()).toEqual(shas.sort());
      expect(row.detail.top).toHaveLength(3);
      // The report's own candidate list is not a reference either: a second report lists the same blobs.
      expect((await gcReport({ pool: t.pool })).candidates.map((c) => c.sha).sort()).toEqual(shas.sort());
      // Once the active run ends its blob is old and unreferenced like any other.
      await t.pool.query("UPDATE runs SET status = 'done' WHERE id = $1", [active.runId]);
      expect((await gcReport({ pool: t.pool })).candidates.map((c) => c.sha)).toContain(ofActiveRun);

      // Schema guard: a text column named *sha* that the reference set does not know stops the GC.
      expect(await unwiredShaColumns(t.pool)).toEqual([]);
      await admin.query('ALTER TABLE vg_extra ADD COLUMN cover_sha text');
      expect(await unwiredShaColumns(t.pool)).toEqual(['vg_extra.cover_sha']);
      await expect(gcReport({ pool: t.pool })).rejects.toThrow(GcRefused);
      await expect(gcReport({ pool: t.pool })).rejects.toThrow(/vg_extra\.cover_sha/);
    } finally {
      await admin.end();
    }
  });

  it('gc delete: refused without a backup in the last 24 h, with a report older than 24 h or a wrong confirm count; otherwise deletes the row and moves the file to trash/<date>/, skips a blob that gained a reference after the report, audits blob.deleted in groups and leaves FK-referenced rows; trash older than 7 days is purged; restore-blob brings a trashed blob back', async () => {
    const t = await fresh();
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-gcdel-'));
    const a = await blob(t, dataDir, 30, '.png');
    const b = await blob(t, dataDir, 30, '.json');
    const c = await blob(t, dataDir, 30);
    const e = await blob(t, dataDir, 30);
    const rep = await gcReport({ pool: t.pool });
    expect(rep.candidates).toHaveLength(4);
    const del = (confirm: string, reportId = rep.id) => gcDelete({ pool: t.pool, dataDir, auditGroup: 2 }, { reportId, confirm });

    await expect(del('4')).rejects.toThrow(/Son 24 saatte başarılı yedek yok/);
    await freshBackup(t, 30);
    await expect(del('4')).rejects.toThrow(/Son 24 saatte başarılı yedek yok/);
    await freshBackup(t, 1);
    await expect(del('3')).rejects.toThrow(/Onay sayısı tutmuyor: rapor 4 aday/);
    await t.pool.query("UPDATE maintenance_runs SET started_at = started_at - interval '25 hours' WHERE id = $1", [rep.id]);
    await expect(del('4')).rejects.toThrow(/Rapor 24 saatten eski/);
    await t.pool.query("UPDATE maintenance_runs SET started_at = started_at + interval '25 hours' WHERE id = $1", [rep.id]);
    await expect(del('4', randomUUID())).rejects.toThrow(/Rapor bulunamadı/);
    expect(await rowExists(t, a.sha256)).toBe(true);

    // After the report, c gained a reference in a jsonb column: the delete re-checks and skips it.
    await t.pool.query("INSERT INTO settings (key, value) VALUES ('test.late', $1)", [JSON.stringify({ sha: c.sha256 })]);
    const since = Number((await t.pool.query('SELECT coalesce(max(seq), 0) AS s FROM audit_log')).rows[0].s);
    const out = await del('4');
    expect(out).toEqual({ deleted: 3, skipped: 1, bytes: a.bytes + b.bytes + e.bytes });
    const day = localDay(Date.now());
    for (const x of [a, b, e]) {
      expect(await rowExists(t, x.sha256)).toBe(false);
      expect(existsSync(join(dataDir, x.path))).toBe(false);
      const ext = x.path.slice(x.path.lastIndexOf('.'));
      expect(existsSync(join(dataDir, 'trash', day, `${x.sha256}${ext}`))).toBe(true);
    }
    expect(await rowExists(t, c.sha256)).toBe(true);
    expect(existsSync(join(dataDir, c.path))).toBe(true);
    const audits = (await t.pool.query("SELECT data FROM audit_log WHERE seq > $1 AND action = 'blob.deleted' ORDER BY seq", [since])).rows.map((r) => r.data);
    expect(audits.map((d) => d.count)).toEqual([2, 1]);
    expect(audits.flatMap((d) => d.shas).sort()).toEqual([a.sha256, b.sha256, e.sha256].sort());
    expect(audits.every((d) => d.reportId === rep.id)).toBe(true);
    expect(audits.reduce((s, d) => s + d.bytes, 0)).toBe(out.bytes);
    expect((await t.pool.query("SELECT status, detail FROM maintenance_runs WHERE kind = 'gc_delete'")).rows).toEqual([
      { status: 'done', detail: expect.objectContaining({ reportId: rep.id, deleted: 3, skipped: 1, bytes: out.bytes }) },
    ]);

    // An FK reference wins even if the reference set missed it: the row and the file stay.
    const r = await run(t);
    const fk = await blob(t, dataDir, 30);
    await insertArtifact(t.pool, { runId: r.runId, kind: 'final', blobSha: fk.sha256 });
    expect(await deleteBlob({ pool: t.pool, dataDir }, fk.sha256)).toBe('referenced');
    expect(await rowExists(t, fk.sha256)).toBe(true);
    expect(existsSync(join(dataDir, fk.path))).toBe(true);
    // A blob touched again (putBlob re-use) is not deleted by the age guard.
    const touched = await blob(t, dataDir, 3);
    expect(await deleteBlob({ pool: t.pool, dataDir }, touched.sha256)).toBe('touched');

    // Trash: day folders older than 7 days are purged, newer ones stay.
    const oldDay = localDay(Date.now() - 8 * DAY);
    mkdirSync(join(dataDir, 'trash', oldDay), { recursive: true });
    writeFileSync(join(dataDir, 'trash', oldDay, `${'f'.repeat(64)}.bin`), 'x');
    mkdirSync(join(dataDir, 'trash', localDay(Date.now() - 6 * DAY)), { recursive: true });
    mkdirSync(join(dataDir, 'trash', 'notes'), { recursive: true });
    const purged = await purgeTrash(dataDir, Date.now());
    expect(purged).toEqual({ dirs: [oldDay], files: 1 });
    expect(existsSync(join(dataDir, 'trash', oldDay))).toBe(false);
    expect(existsSync(join(dataDir, 'trash', localDay(Date.now() - 6 * DAY)))).toBe(true);
    expect(existsSync(join(dataDir, 'trash', 'notes'))).toBe(true);
    expect(existsSync(join(dataDir, 'trash', day))).toBe(true);

    // restore-blob: the library call and the CLI each bring one back (file in place, row re-inserted, audited).
    const back = await restoreBlob({ pool: t.pool, dataDir }, a.sha256);
    expect(back).toMatchObject({ sha256: a.sha256, path: a.path, bytes: a.bytes, mime: 'image/png' });
    expect(readFileSync(join(dataDir, a.path))).toEqual(readFileSync(a.src));
    expect(await rowExists(t, a.sha256)).toBe(true);
    const cli = await new Promise<{ code: number; out: string; err: string }>((res) => {
      execFile(process.execPath, [join(ROOT, 'bin/maintenance.mjs'), 'restore-blob', b.sha256], {
        cwd: ROOT, env: { ...process.env, VG_DATABASE_URL: t.appUrl, VG_ADMIN_DATABASE_URL: t.adminUrl, VG_DATA_DIR: dataDir }, timeout: 60_000,
      }, (err, stdout, stderr) => res({ code: err ? Number(err.code ?? 1) : 0, out: String(stdout), err: String(stderr) }));
    });
    expect(cli.err).toBe('');
    expect(cli.code).toBe(0);
    expect(cli.out).toContain(b.sha256);
    expect(readFileSync(join(dataDir, b.path), 'utf8')).toBe(readFileSync(b.src, 'utf8'));
    expect((await t.pool.query('SELECT mime, bytes FROM blobs WHERE sha256 = $1', [b.sha256])).rows[0]).toEqual({ mime: 'application/json', bytes: String(b.bytes) });
    expect((await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'blob.restored'")).rows[0].n).toBe(2);
    await expect(restoreBlob({ pool: t.pool, dataDir }, 'a'.repeat(64))).rejects.toThrow(/çöp kutusunda yok/);
  });

  it('putBlob racing gc: an old unreferenced blob that putBlob re-uses while gcDelete runs ends with its row and its file (either the delete is skipped or the file is rewritten); no row without a file and no file without a row', async () => {
    const t = await fresh();
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-race-'));
    await freshBackup(t);

    // putBlob takes the blob's shared lock: while gc holds the exclusive one, putBlob waits.
    const held = await blob(t, dataDir, 30);
    let putDone = false;
    let put: Promise<unknown> = Promise.resolve();
    await withBlobLock(t.pool, held.sha256, 'exclusive', async () => {
      put = putBlob(t.pool, dataDir, held.src).then(() => { putDone = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(putDone).toBe(false);
    });
    await put;
    expect(putDone).toBe(true);

    // Order 1: putBlob re-uses the blob before the delete → touched_at is fresh, the delete skips it.
    const first = await blob(t, dataDir, 30);
    const rep1 = await gcReport({ pool: t.pool });
    await putBlob(t.pool, dataDir, first.src);
    expect(await gcDelete({ pool: t.pool, dataDir }, { reportId: rep1.id, confirm: String(rep1.candidates.length) })).toMatchObject({ deleted: rep1.candidates.length - 1, skipped: 1 });
    expect(await rowExists(t, first.sha256)).toBe(true);
    expect(existsSync(join(dataDir, first.path))).toBe(true);

    // Order 2: the delete wins → putBlob re-inserts the row and rewrites the file.
    const second = await blob(t, dataDir, 30);
    const rep2 = await gcReport({ pool: t.pool });
    expect(await gcDelete({ pool: t.pool, dataDir }, { reportId: rep2.id, confirm: String(rep2.candidates.length) })).toMatchObject({ deleted: 1 });
    expect(await rowExists(t, second.sha256)).toBe(false);
    expect(await putBlob(t.pool, dataDir, second.src)).toMatchObject({ created: true });
    expect(await rowExists(t, second.sha256)).toBe(true);
    expect(readFileSync(join(dataDir, second.path), 'utf8')).toBe(readFileSync(second.src, 'utf8'));

    // Truly concurrent: each blob is re-used once while one delete runs over all of them.
    const many = await Promise.all(Array.from({ length: 12 }, () => blob(t, dataDir, 30)));
    const rep3 = await gcReport({ pool: t.pool });
    expect(rep3.candidates).toHaveLength(12);
    const reuse = many.map((m, i) => new Promise((r) => setTimeout(r, i * 3)).then(() => putBlob(t.pool, dataDir, m.src)));
    const [res] = await Promise.all([gcDelete({ pool: t.pool, dataDir }, { reportId: rep3.id, confirm: '12' }), ...reuse]);
    expect(res.deleted + res.skipped).toBe(12);
    for (const m of [...many, first, second, held]) {
      expect(await rowExists(t, m.sha256)).toBe(true);
      expect(existsSync(join(dataDir, m.path))).toBe(true);
      expect(readFileSync(join(dataDir, m.path), 'utf8')).toBe(readFileSync(m.src, 'utf8'));
    }
  });

  it('orphan report: disk-only files, db-only rows, size mismatches and run dirs without a run are reported and never deleted; upload leftovers older than 1 h are removed', async () => {
    const t = await fresh();
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-orph-'));
    const ok = await blob(t, dataDir, 0);
    const gone = await blob(t, dataDir, 0);
    rmSync(join(dataDir, gone.path));
    const resized = await blob(t, dataDir, 0, '.txt', 'short');
    writeFileSync(join(dataDir, resized.path), 'a much longer body than before');
    const strangerSha = 'e'.repeat(64);
    const strangerRel = join('media', 'sha256', 'ee', 'ee', `${strangerSha}.png`);
    mkdirSync(join(dataDir, 'media', 'sha256', 'ee', 'ee'), { recursive: true });
    writeFileSync(join(dataDir, strangerRel), 'not in the db');
    writeFileSync(join(dataDir, 'media', 'sha256', 'ee', 'ee', `${strangerSha}.png.1a2b3c4d.tmp`), 'in flight');
    const r = await run(t);
    mkdirSync(join(dataDir, 'runs', r.runId), { recursive: true });
    const strayId = randomUUID();
    mkdirSync(join(dataDir, 'runs', strayId, 'final'), { recursive: true });
    writeFileSync(join(dataDir, 'runs', strayId, 'final', 'x.mp4'), 'x');
    const uploads = join(dataDir, 'uploads');
    mkdirSync(uploads, { recursive: true });
    const now = Date.now();
    writeFileSync(join(uploads, `${randomUUID()}.wav`), 'old');
    writeFileSync(join(uploads, `${randomUUID()}.license.txt`), 'old');
    for (const f of readdirSync(uploads)) utimesSync(join(uploads, f), new Date(now - 2 * 3_600_000), new Date(now - 2 * 3_600_000));
    const keep = `${randomUUID()}.mp3`;
    writeFileSync(join(uploads, keep), 'new');

    const rep = await orphanReport({ pool: t.pool, dataDir, now });
    expect(rep).toEqual({ diskOnly: [strangerRel], dbOnly: [gone.sha256], sizeMismatch: [resized.sha256], strayRunDirs: [join('runs', strayId)], uploadsRemoved: 2 });
    expect(existsSync(join(dataDir, strangerRel))).toBe(true);
    expect(existsSync(join(dataDir, resized.path))).toBe(true);
    expect(existsSync(join(dataDir, ok.path))).toBe(true);
    expect(existsSync(join(dataDir, 'runs', strayId, 'final', 'x.mp4'))).toBe(true);
    expect(await rowExists(t, gone.sha256)).toBe(true);
    expect(readdirSync(uploads)).toEqual([keep]);
    const row = (await t.pool.query("SELECT status, detail FROM maintenance_runs WHERE kind = 'orphan_report'")).rows[0];
    expect(row).toMatchObject({ status: 'done', detail: { diskOnly: 1, dbOnly: 1, sizeMismatch: 1, strayRunDirs: 1, uploadsRemoved: 2, samples: { dbOnly: [gone.sha256] } } });

    // The maintenance loop: the first look on a Monday (local time) makes the weekly GC and orphan reports once; every look sweeps uploads.
    const bin = mkdtempSync(join(tmpdir(), 'vg-fakedump-'));
    const dump = join(bin, 'dump');
    writeFileSync(dump, "#!/bin/sh\nprintf 'PGDMP fake'\n");
    chmodSync(dump, 0o755);
    const base = loadConfig();
    const config: Config = { ...base, backup: { ...base.backup, pgDump: [dump] } };
    let clock = new Date(2026, 9, 12, 9, 0).getTime(); // Monday
    const svc = new MaintenanceService({ pool: t.pool, dataDir, config, audit: async (action, data) => { await appendAudit(t.pool, { actorType: 'system', action, data }); }, clock: { now: () => clock } });
    const count = async (kind: string) => Number((await t.pool.query('SELECT count(*)::int AS n FROM maintenance_runs WHERE kind = $1', [kind])).rows[0].n);
    // File ages are measured against the service clock.
    writeFileSync(join(uploads, `${randomUUID()}.ogg`), 'stale');
    for (const f of readdirSync(uploads)) {
      const at = new Date(f === keep ? clock : clock - 2 * 3_600_000);
      utimesSync(join(uploads, f), at, at);
    }
    await svc.tick();
    expect([await count('backup'), await count('gc_report'), await count('orphan_report')]).toEqual([1, 1, 2]);
    expect(readdirSync(uploads)).toEqual([keep]);
    clock += 3_600_000;
    await svc.tick();
    expect([await count('gc_report'), await count('orphan_report')]).toEqual([1, 2]);
    clock += DAY; // Tuesday: no weekly report
    await svc.tick();
    expect([await count('gc_report'), await count('orphan_report')]).toEqual([1, 2]);
    svc.stop();
    expect(statSync(join(dataDir, strangerRel)).size).toBeGreaterThan(0);
  });
});
