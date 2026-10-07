import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, getBlob, insertArtifact, latestArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore } from '@videogen/claude';
import { layoutIssues, type LayoutManifest } from '@videogen/remotion/layout';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { importAsset } from '../src/assets.ts';
import { composeExecutor, finalRenderExecutor, type FinalFramesMeta } from '../src/pipeline/final-steps.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { framePath } from '../src/render/frames.ts';
import { ResourceLocks } from '../src/render/locks.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-compose-step-'));
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10, encodePreset: 'ultrafast' };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  cleanups.push(() => manager.stop());
  return { dataDir, deps: { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene } as StepDeps };
}
/** research + storyboard + fake build + fake final frames of one run. */
async function framed(deps: StepDeps, name = 'Tükenmez kalem') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent', ['research', 'storyboard', 'build', 'final_render', 'compose']) });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (key: 'build' | 'final_render' | 'compose'): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
    versionId: r.versionId, runDir, signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  for (const ex of [buildExecutor(deps), finalRenderExecutor(deps)]) expect(await ex.run(ctx(ex.key as 'build'), await ex.inputHash(ctx(ex.key as 'build')))).toMatchObject({ status: 'done' });
  return { r, ctx, runDir };
}

describe('compose step', () => {
  it('without an allowed music track the music variant is SFX only and the plan says so', async () => {
    const { deps } = setup();
    const { r, ctx } = await framed(deps);
    const ex = composeExecutor(deps);
    const out = await ex.run(ctx('compose'), await ex.inputHash(ctx('compose')));
    expect(out).toMatchObject({ status: 'done', note: expect.stringMatching(/^1080×1920 · 0:45 · \d+ efekt · müzik: yok$/) });
    expect((await latestArtifact(t.pool, r.runId, 'audio_plan'))!.content).toMatchObject({ music: null });
  }, 180_000);

  it('records the layout, the sound plan, both variants sharing one video stream, and the cover', async () => {
    const { deps, dataDir } = setup();
    const bed = join(dataDir, 'bed.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=brown:r=48000:a=0.3:seed=5', '-ac', '2', bed]);
    const lic = join(dataDir, 'lic.txt');
    writeFileSync(lic, 'CC0 1.0 (test)');
    await importAsset(t.pool, dataDir, FFMPEG, { kind: 'music', file: bed, title: 'Test yatağı', spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: lic });
    const { r, ctx } = await framed(deps);
    const ex = composeExecutor(deps);
    const hash = await ex.inputHash(ctx('compose'));
    expect(await ex.run(ctx('compose'), hash)).toMatchObject({ status: 'done', note: expect.stringMatching(/^1080×1920 · 0:45 · \d+ efekt · müzik: Test yatağı$/) });
    const kinds = (await t.pool.query('SELECT kind FROM artifacts WHERE run_id = $1 AND input_hash = $2 ORDER BY kind', [r.runId, hash])).rows.map((x) => x.kind);
    expect(kinds).toEqual(['audio_plan', 'final_cover', 'final_video_music', 'final_video_tiktok', 'layout']);
    const music = (await latestArtifact(t.pool, r.runId, 'final_video_music'))!;
    const tiktok = (await latestArtifact(t.pool, r.runId, 'final_video_tiktok'))!;
    expect((await t.pool.query('SELECT width, height, codec, duration_ms FROM artifacts WHERE id = $1', [music.id])).rows[0]).toMatchObject({ width: 1080, height: 1920, codec: 'h264', duration_ms: 45033 });
    const file = async (sha: string) => join(dataDir, (await getBlob(t.pool, sha))!.path);
    const md5 = (f: string) => execFileSync(FFMPEG, ['-v', 'error', '-i', f, '-map', '0:v', '-c', 'copy', '-f', 'md5', '-']).toString();
    expect(md5(await file(music.blobSha!))).toBe(md5(await file(tiktok.blobSha!)));
    const layout = (await latestArtifact(t.pool, r.runId, 'layout'))!.content as LayoutManifest;
    expect(layout.frames.length).toBeGreaterThan(270);
    expect(layoutIssues(layout)).toEqual([]);
    expect(await ex.reuse!(ctx('compose'), hash)).toBe(true);
  }, 180_000);

  it('never composes stale frames (spec §8.3) or a frame set with a hole', async () => {
    const { deps } = setup();
    const a = await framed(deps, 'Kalem bayat');
    const scene = fx('scene-kalem');
    await insertArtifact(t.pool, { runId: a.r.runId, kind: 'scene', content: { ...scene, camera_keys: scene.camera_keys.map((k: { lens_mm: number }, i: number) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) } });
    const ex = composeExecutor(deps);
    expect(await ex.run(a.ctx('compose'), await ex.inputHash(a.ctx('compose')))).toEqual({ status: 'failed', error: 'final kareler güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    const b = await framed(deps, 'Kalem eksik');
    const meta = (await latestArtifact(t.pool, b.r.runId, 'final_frames'))!.meta as FinalFramesMeta;
    truncateSync(framePath(join(b.runDir, meta.dir), 700), 10);
    expect(await ex.run(b.ctx('compose'), await ex.inputHash(b.ctx('compose')))).toEqual({ status: 'failed', error: 'eksik final kare: 1 (ilk: f00700)', retry: false });
  }, 180_000);
});
