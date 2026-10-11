import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { createProduceRun, getVideoView, unwiredShaColumns, updateVideo } from '../src/index.ts';
import { MIGRATIONS_DIR, runMigrations } from '../src/migrate.ts';
import { createTestDb, withDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const plan = [{ key: 'research' as const, weight: 100 }];

describe('migration 0013 (video library L13, L25)', () => {
  it('publications is gone, GC has no unwired sha column, and a new video defaults to origin pipeline with all platforms none', async () => {
    expect((await t.pool.query("SELECT to_regclass('public.publications') AS r")).rows[0].r).toBeNull();
    expect(await unwiredShaColumns(t.pool)).toEqual([]);
    const r = await createProduceRun(t.pool, { productName: 'Göç kalemi', audioMode: 'silent', plan });
    const v = (await getVideoView(t.pool, r.videoId))!;
    expect(v).toMatchObject({ origin: 'pipeline', approach: 'yaklasim', caption: null, youtubeTitle: null }); // a new silent production is a YAKLASIM video
    expect(Object.values(v.platforms).map((p) => p.status)).toEqual(['none', 'none', 'none']);
  });

  it('platform_uploads is append-only for the app role and checks platform/action', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Ek kalem', audioMode: 'silent', plan });
    const ins = (platform: string) => t.pool.query(
      'INSERT INTO platform_uploads (video_id, version_id, platform, action, uploaded_at) VALUES ($1, $2, $3, $4, now())', [r.videoId, r.versionId, platform, 'uploaded'],
    );
    await ins('youtube');
    await expect(t.pool.query('UPDATE platform_uploads SET note = $1', ['x'])).rejects.toThrow(/permission denied/);
    await expect(t.pool.query('DELETE FROM platform_uploads')).rejects.toThrow(/permission denied/);
    await expect(t.pool.query('TRUNCATE platform_uploads')).rejects.toThrow(/permission denied/);
    await expect(ins('vimeo')).rejects.toThrow(/platform_uploads_platform_ck/);
  });

  it('updateVideo sets any status (no published guard any more)', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Durum kalemi', audioMode: 'silent', plan });
    await updateVideo(t.pool, r.videoId, { status: 'ready' });
    expect((await getVideoView(t.pool, r.videoId))!.status).toBe('ready');
  });

  it('refuses to drop publications while it has rows, and turns published videos into ready ones', { timeout: 60_000 }, async () => {
    const cfg = loadConfig();
    const dir = mkdtempSync(join(tmpdir(), 'vg-mig-'));
    const upTo12 = join(dir, 'm12');
    cpSync(MIGRATIONS_DIR, upTo12, { recursive: true });
    rmSync(join(upTo12, '0013_video_library.sql'));
    rmSync(join(upTo12, 'meta/0013_snapshot.json'));
    const j = JSON.parse(readFileSync(join(upTo12, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
    j.entries = j.entries.filter((e) => e.tag !== '0013_video_library');
    writeFileSync(join(upTo12, 'meta/_journal.json'), JSON.stringify(j));
    const admin = new pg.Client({ connectionString: cfg.adminDatabaseUrl });
    await admin.connect();
    const names = ['vg_mig13_rows', 'vg_mig13_empty'];
    for (const n of names) { await admin.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`); await admin.query(`CREATE DATABASE ${n}`); }
    try {
      const seed = async (n: string, withPublication: boolean) => {
        await runMigrations(withDb(cfg.adminDatabaseUrl, n), upTo12);
        const c = new pg.Client({ connectionString: withDb(cfg.adminDatabaseUrl, n) });
        await c.connect();
        try {
          await c.query("INSERT INTO products (id, name, normalized_name) VALUES ('00000000-0000-4000-8000-000000000001', 'K', 'k')");
          await c.query(`INSERT INTO videos (id, product_id, title, audio_mode, status) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'K', 'silent', 'published')`);
          await c.query("INSERT INTO versions (id, video_id, round, reason) VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 0, 'produce')");
          if (withPublication) {
            await c.query(`INSERT INTO publications (id, video_id, version_id, variant, status, blob_sha, bytes, caption, aigc_required)
              VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'tiktok', 'published', 'x', 1, 'c', false)`);
          }
        } finally { await c.end(); }
      };
      await seed(names[0]!, true);
      await expect(runMigrations(withDb(cfg.adminDatabaseUrl, names[0]!))).rejects.toThrow(/publications has rows/);
      await seed(names[1]!, false);
      await runMigrations(withDb(cfg.adminDatabaseUrl, names[1]!));
      const c = new pg.Client({ connectionString: withDb(cfg.adminDatabaseUrl, names[1]!) });
      await c.connect();
      try {
        expect((await c.query('SELECT status FROM videos')).rows[0].status).toBe('ready');
      } finally { await c.end(); }
    } finally {
      for (const n of names) await admin.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`);
      await admin.end();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
