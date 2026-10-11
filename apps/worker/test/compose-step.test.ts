import { readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getBlob, insertArtifact, latestArtifact, putBlob } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { composeExecutor, composeSource, currentEvents, type FinalFramesMeta } from '../src/pipeline/final-steps.ts';
import { framePath } from '../src/render/frames.ts';
import { fakeMusicBed } from '../src/render/ffmpeg.ts';
import { musicRenderS } from '../src/pipeline/music-step.ts';
import { finalHarness } from './final-helpers.ts';
import { importAsset } from '../src/assets.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));
const harnesses: ReturnType<typeof finalHarness>[] = [];
const setup = () => { const h = finalHarness(t); harnesses.push(h); return h; };
afterAll(async () => { for (const h of harnesses) await h.stop(); });

describe('compose step', () => {
  it('spec Z5: the music is the fixed stem only — a ledger music track is never used, and without the stem compose stops at the license gate', async () => {
    const h = setup();
    const { r, ctx } = await h.framed('Tükenmez kalem defter', { noMusic: true });
    const bed = join(h.deps.dataDir, 'bed.wav');
    await fakeMusicBed(process.env.VG_FFMPEG ?? 'ffmpeg', bed, 20);
    writeFileSync(join(h.deps.dataDir, 'bed.txt'), 'CC0 1.0 (test)');
    await importAsset(t.pool, h.deps.dataDir, process.env.VG_FFMPEG ?? 'ffmpeg', { kind: 'music', file: bed, title: 'Defter yatağı', spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: join(h.deps.dataDir, 'bed.txt') });
    const ex = composeExecutor(h.deps);
    expect(await ex.run(ctx('compose'), await ex.inputHash(ctx('compose')))).toMatchObject({ status: 'failed', error: expect.stringMatching(/üretilen müzik bulunamadı/) });
    expect(await latestArtifact(t.pool, r.runId, 'final_video_music')).toBeNull();
    await t.pool.query("UPDATE assets SET allowed = false WHERE title = 'Defter yatağı'");
  }, 180_000);

  it('agent music design A4/A5: the music step\'s newest stem is the music (no ledger asset, no attribution); music and SFX stems are recorded as FLAC', async () => {
    const h = setup();
    const { r, ctx } = await h.framed('Tükenmez kalem müzikli');
    const file = join(h.deps.dataDir, 'stem-src.wav');
    await fakeMusicBed(process.env.VG_FFMPEG ?? 'ffmpeg', file, musicRenderS(45));
    const blob = await putBlob(t.pool, h.deps.dataDir, file);
    await insertArtifact(t.pool, { runId: r.runId, kind: 'music_stem', blobSha: blob.sha256, inputHash: 'm1' });
    const ex = composeExecutor(h.deps);
    const out = await ex.run(ctx('compose'), await ex.inputHash(ctx('compose')));
    expect(out).toMatchObject({ status: 'done', note: expect.stringMatching(/müzik: YAKLASIM müziği$/) });
    expect((await latestArtifact(t.pool, r.runId, 'audio_plan'))!.content).toMatchObject({ music: { generatedSha: blob.sha256, title: 'YAKLASIM müziği', gainDb: -18 } });
    expect((await latestArtifact(t.pool, r.runId, 'audio'))!.content).toMatchObject({ music: { source: 'generated', asset_id: null } });
    for (const kind of ['stem_music', 'stem_sfx']) {
      const a = (await latestArtifact(t.pool, r.runId, kind))!;
      expect((await getBlob(t.pool, a.blobSha!))!.path).toMatch(/\.flac$/);
    }
    expect(await latestArtifact(t.pool, r.runId, 'stem_voice')).toBeNull(); // silent video
  }, 180_000);

  it('renaming a part label (name_tr) keeps the final frames current; a storyboard edit recomposes; a lens change makes the frames stale; YAKLASIM sounds only', async () => {
    const h = setup();
    const { r } = await h.framed('Kalem etiket');
    const scene = fx('scene-kalem');
    const board = fx('storyboard-kalem');
    const src = async () => (await composeSource(h.deps, r.runId, r.videoId, 'silent')) as Exclude<Awaited<ReturnType<typeof composeSource>>, { error: string } | null>;
    const tickAt = (s: Awaited<ReturnType<typeof src>>) => s.sound.cues.filter((c) => c.source.startsWith('event:label_in:')).map((c) => [c.source, c.atMs]);
    // the unchanged fixture beats give back the events build.py stored; Python rounds half to even (0.15 s → frame 4, 0.05 s → frame 2)
    const stored = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/scene/kalem/events.json'), 'utf8')).events;
    expect(currentEvents(stored, board.beats, 30)).toEqual(stored);
    const half = (t: number) => currentEvents([], [{ ...board.beats[0], id: 'b', t_start: t, parts: ['govde'] }], 30)[0]!.frame;
    expect([half(0.15), half(0.05), half(0.25), half(0.1)]).toEqual([4, 2, 8, 3]);
    const before = await src();
    expect(before.framesHash).toBe(before.currentFramesHash);
    // YAKLASIM spec Y15: no label ticks; quiet for 5 s, then the snaps of the parts locking home, a tap on each flash cut and the final land.
    expect(tickAt(before)).toEqual([]);
    expect(before.sound.cues.every((c) => c.atMs >= 5000 && ['y_snap', 'y_tap', 'y_land'].includes(c.name))).toBe(true);
    expect(before.sound.cues.find((c) => c.name === 'y_land')).toMatchObject({ source: 'event:part_lock:yay', atMs: 12500 });
    expect(before.sound.cues.find((c) => c.source === 'beat:b3')).toMatchObject({ name: 'y_tap', atMs: 5500 });

    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene', content: { ...scene, parts: scene.parts.map((p: { id: string; name_tr: string }) => (p.id === 'bilye' ? { ...p, name_tr: 'Yuvarlak bilye' } : p)) } });
    const renamed = await src();
    expect(renamed.framesHash).toBe(renamed.currentFramesHash);
    expect(renamed.hash).not.toBe(before.hash); // the label is drawn by compose, so compose reruns; only the frames stay

    // Review T2 Critical: a compose-scope fix of a beat's time or parts must move the label_in tick cues (build.py wrote them at build time).
    const moved = { ...board, beats: board.beats.map((b: { id: string; t_start: number; t_end: number; parts: string[] }) =>
      (b.id === 'b1' ? { ...b, t_end: 4, parts: ['yay'] } : b.id === 'b2' ? { ...b, t_start: 4 } : b)) };
    await insertArtifact(t.pool, { runId: r.runId, kind: 'storyboard', content: moved });
    const after = await src();
    expect(after.framesHash).toBe(after.currentFramesHash);
    expect(after.hash).not.toBe(renamed.hash);
    expect(tickAt(after)).toEqual([]);

    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene', content: { ...scene, camera_keys: scene.camera_keys.map((k: { lens_mm: number }, i: number) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) } });
    const stale = await src();
    expect(stale.framesHash).not.toBe(stale.currentFramesHash);
  }, 180_000);

  it('never composes stale frames (spec §8.3) or a frame set with a hole', async () => {
    const h = setup();
    const deps = h.deps;
    const a = await h.framed('Kalem bayat');
    const scene = fx('scene-kalem');
    await insertArtifact(t.pool, { runId: a.r.runId, kind: 'scene', content: { ...scene, camera_keys: scene.camera_keys.map((k: { lens_mm: number }, i: number) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) } });
    const ex = composeExecutor(deps);
    expect(await ex.run(a.ctx('compose'), await ex.inputHash(a.ctx('compose')))).toEqual({ status: 'failed', error: 'final kareler güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    const b = await h.framed('Kalem eksik');
    const meta = (await latestArtifact(t.pool, b.r.runId, 'final_frames'))!.meta as FinalFramesMeta;
    truncateSync(framePath(join(b.runDir, meta.dir), 200), 10);
    expect(await ex.run(b.ctx('compose'), await ex.inputHash(b.ctx('compose')))).toEqual({ status: 'failed', error: 'eksik final kare: 1 (ilk: f00200)', retry: false });
  }, 180_000);
});
