import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../packages/db/test/helpers.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
let t: Awaited<ReturnType<typeof createTestDb>>;
const data = mkdtempSync(join(tmpdir(), 'vg-import-cli-'));
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

function clip(slug: string, size: string): string {
  const dir = join(data, 'episodes', slug);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, 'final.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=30:duration=1`, '-f', 'lavfi', '-i', 'sine=duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', f]);
  writeFileSync(join(dir, 'caption.txt'), `Inside ${slug}. Why?\n\n#test`);
  return createHash('sha256').update(readFileSync(f)).digest('hex');
}
const run = (manifest: string, ...extra: string[]) =>
  spawnSync('node', [join(ROOT, 'bin/import-episodes.mjs'), '--manifest', manifest, '--data-dir', data, ...extra], {
    encoding: 'utf8', env: { ...process.env, VG_DATABASE_URL: t.appUrl, VG_DATA_DIR: data },
  });
const count = async (sql: string) => Number((await t.pool.query(sql)).rows[0].count);

describe('bin/import-episodes.mjs (video library L8, L10)', () => {
  it('dry run writes nothing; a real run imports, warns on a non-1080x1920 file, reports a missing one and exits 1; a rerun says exists', async () => {
    const ok = clip('ok-ep', '1080x1920');
    const small = clip('small-ep', '720x1280');
    const e = (slug: string, sha: string) => ({ slug, product: `Ürün ${slug}`, title: `${slug} — what's inside`, language: 'en', audioMode: 'silent', approach: null, sha256: sha, recordedAt: '2026-10-07T12:00:00.000Z' });
    const manifest = join(data, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ episodes: [e('ok-ep', ok), e('small-ep', small), e('gone-ep', 'a'.repeat(64))] }));
    const dry = run(manifest, '--dry-run');
    expect(dry.stdout).toMatch(/ok-ep: would import 1\.0 s/);
    expect(await count('SELECT count(*) FROM videos')).toBe(0);
    expect(await count('SELECT count(*) FROM blobs')).toBe(0);
    const r = run(manifest);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/ok-ep: imported\n/);
    expect(r.stdout).toMatch(/small-ep: imported \(warning: 720x1280/);
    expect(r.stdout).toMatch(/gone-ep: missing/);
    expect(await count("SELECT count(*) FROM videos WHERE origin = 'import'")).toBe(2);
    expect(await count("SELECT count(*) FROM artifacts WHERE kind = 'final_cover'")).toBe(2);
    const again = run(manifest);
    expect(again.stdout).toMatch(/ok-ep: exists/);
    expect(await count("SELECT count(*) FROM videos WHERE origin = 'import'")).toBe(2);
  }, 90_000);

  it('a file changed after the manifest was written is refused', async () => {
    const sha = clip('changed-ep', '1080x1920');
    writeFileSync(join(data, 'episodes', 'changed-ep', 'final.mp4'), 'not the same bytes');
    const manifest = join(data, 'manifest-changed.json');
    writeFileSync(manifest, JSON.stringify({ episodes: [{ slug: 'changed-ep', product: 'Değişen', title: 'x — y', language: 'tr', audioMode: 'silent', approach: null, sha256: sha, recordedAt: '2026-10-07T12:00:00.000Z' }] }));
    const r = run(manifest);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/changed-ep: sha mismatch/);
  }, 60_000);
});
