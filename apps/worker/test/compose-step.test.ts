import { readFileSync, truncateSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertArtifact, latestArtifact } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { composeExecutor, composeSource, currentEvents, type FinalFramesMeta } from '../src/pipeline/final-steps.ts';
import { framePath } from '../src/render/frames.ts';
import { finalHarness } from './final-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));
const harnesses: ReturnType<typeof finalHarness>[] = [];
const setup = () => { const h = finalHarness(t); harnesses.push(h); return h; };
afterAll(async () => { for (const h of harnesses) await h.stop(); });

describe('compose step', () => {
  it('without an allowed music track the music variant is SFX only and the plan says so', async () => {
    const h = setup();
    const { r, ctx } = await h.framed('Tükenmez kalem');
    const deps = h.deps;
    const ex = composeExecutor(deps);
    const out = await ex.run(ctx('compose'), await ex.inputHash(ctx('compose')));
    expect(out).toMatchObject({ status: 'done', note: expect.stringMatching(/^1080×1920 · 0:45 · \d+ efekt · müzik: yok$/) });
    expect((await latestArtifact(t.pool, r.runId, 'audio_plan'))!.content).toMatchObject({ music: null });
  }, 180_000);

  it('renaming a part label (name_tr) keeps the final frames current; a lens change makes them stale', async () => {
    const h = setup();
    const { r } = await h.framed('Kalem etiket');
    const scene = fx('scene-kalem');
    const board = fx('storyboard-kalem');
    const src = async () => (await composeSource(h.deps, r.runId, r.videoId)) as Exclude<Awaited<ReturnType<typeof composeSource>>, { error: string } | null>;
    const tickAt = (s: Awaited<ReturnType<typeof src>>) => s.sound.cues.filter((c) => c.source.startsWith('event:label_in:')).map((c) => [c.source, c.atMs]);
    // the unchanged fixture beats give back the events build.py stored; Python rounds half to even (0.15 s → frame 4, 0.05 s → frame 2)
    const stored = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/scene/kalem/events.json'), 'utf8')).events;
    expect(currentEvents(stored, board.beats, 30)).toEqual(stored);
    const half = (t: number) => currentEvents([], [{ ...board.beats[0], id: 'b', t_start: t, parts: ['govde'] }], 30)[0]!.frame;
    expect([half(0.15), half(0.05), half(0.25), half(0.1)]).toEqual([4, 2, 8, 3]);
    const before = await src();
    expect(before.framesHash).toBe(before.currentFramesHash);
    expect(tickAt(before)).toContainEqual(['event:label_in:b5-mekanizma:bilye', 24_000]);
    expect(tickAt(before)).toContainEqual(['event:label_in:b3-hazne:murekkep-haznesi', 9000]);

    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene', content: { ...scene, parts: scene.parts.map((p: { id: string; name_tr: string }) => (p.id === 'bilye' ? { ...p, name_tr: 'Yuvarlak bilye' } : p)) } });
    const renamed = await src();
    expect(renamed.framesHash).toBe(renamed.currentFramesHash);
    expect(renamed.hash).not.toBe(before.hash); // the label is drawn by compose, so compose reruns; only the frames stay

    // Review T2 Critical: a compose-scope fix of a beat's time or parts must move the label_in tick cues (build.py wrote them at build time).
    const moved = { ...board, beats: board.beats.map((b: { id: string; t_start: number; t_end: number; parts: string[] }) =>
      (b.id === 'b4-ikinci-kanca' ? { ...b, t_end: 24.5 } : b.id === 'b5-mekanizma' ? { ...b, t_start: 24.5 } : b.id === 'b3-hazne' ? { ...b, parts: ['yay'] } : b)) };
    await insertArtifact(t.pool, { runId: r.runId, kind: 'storyboard', content: moved });
    const after = await src();
    expect(after.framesHash).toBe(after.currentFramesHash);
    expect(after.hash).not.toBe(renamed.hash);
    const ticks = tickAt(after);
    expect(ticks).toContainEqual(['event:label_in:b5-mekanizma:bilye', 24_500]);
    expect(ticks).toContainEqual(['event:label_in:b3-hazne:yay', 9000]);
    expect(ticks.map((x) => x[0])).not.toContain('event:label_in:b3-hazne:murekkep-haznesi');
    expect(ticks).not.toContainEqual(['event:label_in:b5-mekanizma:bilye', 24_000]);

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
    truncateSync(framePath(join(b.runDir, meta.dir), 700), 10);
    expect(await ex.run(b.ctx('compose'), await ex.inputHash(b.ctx('compose')))).toEqual({ status: 'failed', error: 'eksik final kare: 1 (ilk: f00700)', retry: false });
  }, 180_000);
});
