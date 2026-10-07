import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, findArtifact, insertArtifact, listRunSteps, updateRun } from '@videogen/db';
import { FakeClaudeDriver, SpecStore } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { finalRenderExecutor, type FinalFramesMeta } from '../src/pipeline/final-steps.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver, RenderError, retryFinal, type FinalOutput } from '../src/render/driver.ts';
import { framePath, missingFrames, removeRunFrames } from '../src/render/frames.ts';
import { ResourceLocks } from '../src/render/locks.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

function setup() {
  const dataDir = tmp('vg-final-');
  const render = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
  const scene: SceneDeps = { pool: t.pool, render, locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10 };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene };
  return { dataDir, deps, render };
}
async function built(deps: StepDeps, name = 'Tükenmez kalem') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent', ['research', 'storyboard', 'build', 'final_render']) });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const progress: number[] = [];
  const ctx = (key: 'build' | 'final_render', attempt = 1): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
    versionId: r.versionId, runDir, signal: new AbortController().signal, progress: (p) => { if (key === 'final_render') progress.push(p); }, status: () => {}, session: () => {},
  });
  const b = buildExecutor(deps);
  expect(await b.run(ctx('build'), await b.inputHash(ctx('build')))).toMatchObject({ status: 'done' });
  return { r, ctx, runDir, progress };
}

describe('final render: driver, step and frame cleanup', () => {
  it('the fake driver writes frames 0…last as PNGs and a second call skips them all', async () => {
    const dir = join(tmp('vg-ff-'), 'frames');
    const d = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    const seen: number[] = [];
    const a = await d.final({ runDir: dir, blendPath: '/x.blend', outDir: dir, lastFrame: 59, owner: 'o', onProgress: (n) => seen.push(n) });
    expect(a).toMatchObject({ frames: 60, skipped: 0, samples: 64, renderer: 'fake' });
    expect(readdirSync(dir).length).toBe(60);
    expect(missingFrames(dir, 59)).toEqual([]);
    expect(seen.at(-1)).toBe(60);
    expect((await d.final({ runDir: dir, blendPath: '/x.blend', outDir: dir, lastFrame: 59, owner: 'o' })).skipped).toBe(60);
  });

  it('a crash is retried once with 32 samples; a second crash is a GPU error (spec §14)', async () => {
    const out: FinalOutput = { dir: '/d', frames: 3, skipped: 1, samples: 32, renderer: 'NVIDIA', ms: 5 };
    const calls: (number | null)[] = [];
    expect(await retryFinal(async (s) => { calls.push(s); return calls.length === 1 ? null : out; })).toBe(out);
    expect(calls).toEqual([null, 32]);
    await expect(retryFinal(async () => null)).rejects.toSatisfy((e: unknown) => e instanceof RenderError && e.kind === 'gpu' && /iki kez/.test(e.message));
  });

  it('records the frames (no blob), reports real frame progress, reuses only a complete set and resumes after a restart', async () => {
    const { deps } = setup();
    const { r, ctx, runDir, progress } = await built(deps);
    const ex = finalRenderExecutor(deps);
    const hash = await ex.inputHash(ctx('final_render'));
    expect(await ex.run(ctx('final_render'), hash)).toEqual({ status: 'done', note: '1351 kare · EEVEE 64 örnek · 0 dk' });
    const a = (await findArtifact(t.pool, { runId: r.runId, kind: 'final_frames', inputHash: hash }))!;
    const meta = a.meta as FinalFramesMeta;
    expect(a.blobSha).toBeNull();
    expect(meta).toMatchObject({ dir: `final/${hash.slice(0, 16)}/frames`, frames: 1351, skipped: 0 });
    expect(progress.at(-1)).toBeGreaterThan(90);
    expect(await ex.reuse!(ctx('final_render'), hash)).toBe(true);
    truncateSync(framePath(join(runDir, meta.dir), 700), 20);
    expect(await ex.reuse!(ctx('final_render'), hash)).toBe(false);
    expect(await ex.run(ctx('final_render', 2), hash)).toEqual({ status: 'done', note: '1351 kare · EEVEE 64 örnek · 0 dk · 1350 kare önceden hazırdı' });
  });

  it('deletes only this run\'s frames when the run ends (done or cancelled), never its scene files or another run\'s frames', async () => {
    const dataDir = tmp('vg-clean-');
    const mk = (run: string) => { const d = join(dataDir, 'runs', run, 'final', 'abc', 'frames'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'f00000.png'), 'x'); mkdirSync(join(dataDir, 'runs', run, 'scene'), { recursive: true }); return d; };
    const a = mk('run-a');
    const b = mk('run-b');
    expect(removeRunFrames(dataDir, 'run-a')).toEqual(['runs/run-a/final/abc/frames']);
    expect([existsSync(a), existsSync(join(dataDir, 'runs', 'run-a', 'scene')), existsSync(b)]).toEqual([false, true, true]);
    expect(removeRunFrames(dataDir, 'run-a')).toEqual([]);

    const o = new Orchestrator({ pool: t.pool, dataDir, executors: {}, tickMs: 20 });
    cleanups.push(() => o.stop());
    const run = await createProduceRun(t.pool, { productName: 'Kalem temizlik', audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
    const d = mk(run.runId);
    await updateRun(t.pool, run.runId, { status: 'running' });
    await o.cancel(run.runId);
    expect(existsSync(d)).toBe(false);
    expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'frames.deleted' AND run_id = $1", [run.runId])).rows[0].data).toEqual({ dirs: [`runs/${run.runId}/final/abc/frames`] });
  });
});
