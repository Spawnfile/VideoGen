import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAudioEditRun, getVideoView, importEpisode, listRunViews, listVersions } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
const dir = mkdtempSync(join(tmpdir(), 'vg-episodes-'));
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

function media(name: string, body: string) {
  const file = join(dir, `${name}.mp4`);
  const cover = join(dir, `${name}.png`);
  writeFileSync(file, body);
  writeFileSync(cover, `png-${body}`);
  return { file, cover, sha: createHash('sha256').update(body).digest('hex') };
}
const entry = (slug: string, sha256: string, product = 'Rubik küpü') =>
  ({ slug, product, title: `${product} — what's inside`, language: 'en' as const, audioMode: 'silent' as const, approach: 'yaklasim' as const, sha256, recordedAt: '2026-10-11T01:58:00.000Z' });
const facts = (m: { file: string; cover: string }) => ({ file: m.file, cover: m.cover, durationMs: 12_600, width: 1080, height: 1920, codec: 'h264', caption: "How a Rubik's cube holds itself together. No glue.\n\n#rubikscube" });

describe('importEpisode (video library L9–L11)', () => {
  it('creates product, video, done import run, version, final + cover with one input hash; the library and versions see it; audited; second run is a no-op', async () => {
    const m = media('rubik', 'rubik-bytes');
    const out = await importEpisode(t.pool, dir, entry('rubik', m.sha), facts(m));
    if (out.kind !== 'imported') throw new Error(out.kind);
    const v = (await getVideoView(t.pool, out.videoId))!;
    expect(v).toMatchObject({ origin: 'import', approach: 'yaklasim', status: 'ready', productName: 'Rubik küpü', title: "Rubik küpü — what's inside", youtubeTitle: "How a Rubik's cube holds itself together." });
    expect(v.caption).toContain('#rubikscube');
    expect(v.final).toMatchObject({ musicSha: m.sha, durationS: 12.6 });
    expect(v.final?.coverSha).toMatch(/^[0-9a-f]{64}$/);
    expect(v.createdAt).toBe('2026-10-11T01:58:00.000Z');
    const vs = await listVersions(t.pool, out.videoId);
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ reason: 'import', best: true, current: true, runId: expect.any(String) });
    expect(vs[0]!.finals).toMatchObject({ musicSha: m.sha, tiktokSha: null, durationS: 12.6 });
    expect((await listRunViews(t.pool, out.videoId)).map((r) => [r.kind, r.status])).toEqual([['import', 'done']]);
    expect((await t.pool.query('SELECT trigger FROM runs WHERE video_id = $1', [out.videoId])).rows[0].trigger).toBe('cli');
    expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'video.imported' AND subject_id = $1", [out.videoId])).rows[0].data).toMatchObject({ slug: 'rubik', sha: m.sha, durationS: 12.6 });
    expect(await importEpisode(t.pool, dir, entry('rubik', m.sha), facts(m))).toEqual({ kind: 'exists', videoId: out.videoId });
    expect(Number((await t.pool.query("SELECT count(*) FROM videos WHERE origin = 'import'")).rows[0].count)).toBe(1);
  });

  it('a file whose sha differs from the manifest is refused and writes no rows', async () => {
    const m = media('bad', 'bad-bytes');
    const before = Number((await t.pool.query('SELECT count(*) FROM videos')).rows[0].count);
    expect(await importEpisode(t.pool, dir, entry('bad', 'f'.repeat(64), 'Kötü'), facts(m))).toEqual({ kind: 'sha_mismatch', actual: m.sha });
    expect(Number((await t.pool.query('SELECT count(*) FROM videos')).rows[0].count)).toBe(before);
  });

  it('two episodes of one product share the product row; no caption → no title', async () => {
    const a = media('kalem-a', 'a-bytes');
    const b = media('kalem-b', 'b-bytes');
    const x = await importEpisode(t.pool, dir, entry('kalem-a', a.sha, 'Kalem'), { ...facts(a), caption: null });
    const y = await importEpisode(t.pool, dir, entry('kalem-b', b.sha, 'Kalem'), facts(b));
    if (x.kind !== 'imported' || y.kind !== 'imported') throw new Error('not imported');
    const vx = (await getVideoView(t.pool, x.videoId))!;
    expect(vx.productId).toBe((await getVideoView(t.pool, y.videoId))!.productId);
    expect([vx.caption, vx.youtubeTitle]).toEqual([null, null]);
  });

  it('an imported video cannot be audio-edited', async () => {
    const m = media('edit', 'edit-bytes');
    const out = await importEpisode(t.pool, dir, entry('edit', m.sha, 'Düzenleme'), facts(m));
    if (out.kind !== 'imported') throw new Error(out.kind);
    expect(await createAudioEditRun(t.pool, { videoId: out.videoId, instruction: 'daha sakin', plan: [] })).toEqual({ error: 'içe aktarılmış bir video düzenlenemez' });
  });
});
