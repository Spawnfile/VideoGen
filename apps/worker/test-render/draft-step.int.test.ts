import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, getBlob, insertArtifact, listArtifacts, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { ReviewTargets, reviewToolHost, toolHosts } from '../src/pipeline/review-tools.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, draftRenderExecutor, draftReviewExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { BlenderRenderDriver, FakeRenderDriver, type RenderDriver } from '../src/render/driver.ts';
import { draftProbeErrors, probeVideo } from '../src/render/ffmpeg.ts';
import { ResourceLocks } from '../src/render/locks.ts';

/**
 * Production path of the draft (no Blender, no Claude): the committed Blender build of the pen (fake build driver) goes through the
 * real draft_render step — the Remotion child process in system Chrome, the §7.5 probe, the artifacts — and then the draft_review step
 * makes its contact sheet from that real 45 s draft. Optional: VG_DRAFT_SHEET=<path> keeps a copy of the sheet for a visual check.
 */
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8'));
let t: Awaited<ReturnType<typeof createTestDb>>;
const dataDir = mkdtempSync(join(tmpdir(), 'vg-draft-step-int-'));
const cleanups: (() => unknown)[] = [];
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { for (const c of cleanups) await c(); await t.drop(); rmSync(dataDir, { recursive: true, force: true }); });

describe('draft_render + draft_review steps on the real Remotion driver', () => {
  it('renders the full pen draft (1351 frames, h264 yuv420p tv bt709), records it, and reviews it from a 4×3 contact sheet', async () => {
    const fake = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    const real = new BlenderRenderDriver({ blender: '/nonexistent', bwrap: '/nonexistent', dataDir, home: dataDir });
    const render: RenderDriver = { kind: 'real', capabilities: () => fake.capabilities(), build: (i) => fake.build(i), stills: (i) => fake.stills(i), draft: (i) => real.draft(i) };
    const scene: SceneDeps = { pool: t.pool, render, locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10 };
    const reviews = new ReviewTargets();
    const manager = new SessionManager({
      pool: t.pool, dataDir, driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
      validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 },
      tools: toolHosts(sceneToolHost(scene), reviewToolHost({ ffmpeg: FFMPEG, targets: reviews })),
    });
    cleanups.push(() => manager.stop());
    const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene, reviews };

    const name = 'Tükenmez kalem';
    const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
    const runDir = join(dataDir, 'runs', r.runId);
    const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
    for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
      await store.write(kind, fx(f));
      await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
    }
    const steps = await listRunSteps(t.pool, r.runId);
    const progress: number[] = [];
    const ctx = (key: 'build' | 'draft_render' | 'draft_review'): StepContext => ({
      runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
      versionId: r.versionId, runDir, signal: new AbortController().signal, progress: (p) => { if (key === 'draft_render') progress.push(p); }, status: () => {}, session: () => {},
    });
    for (const ex of [buildExecutor(deps), draftRenderExecutor(deps)]) {
      expect(await ex.run(ctx(ex.key as 'build'), await ex.inputHash(ctx(ex.key as 'build')))).toMatchObject({ status: 'done' });
    }
    expect(progress.length).toBeGreaterThan(5);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));

    const video = (await t.pool.query("SELECT blob_sha, width, height, codec, duration_ms, meta FROM artifacts WHERE run_id = $1 AND kind = 'draft_video'", [r.runId])).rows[0];
    expect(video).toMatchObject({ width: 540, height: 960, codec: 'h264', meta: expect.objectContaining({ round: 0, frames: 1351 }) });
    expect(Math.round(video.duration_ms / 1000)).toBe(45);
    const file = join(dataDir, (await getBlob(t.pool, video.blob_sha))!.path);
    expect(draftProbeErrors(await probeVideo(FFMPEG, file), { width: 540, height: 960, frames: 1351 })).toEqual([]);

    const review = draftReviewExecutor(deps);
    expect(await review.run(ctx('draft_review'), await review.inputHash(ctx('draft_review')))).toMatchObject({ status: 'done' });
    const sheet = (await listArtifacts(t.pool, r.videoId)).find((a) => a.kind === 'review_sheet')!;
    const sheetPath = join(dataDir, (await getBlob(t.pool, sheet.blobSha!))!.path);
    if (process.env.VG_DRAFT_SHEET) copyFileSync(sheetPath, process.env.VG_DRAFT_SHEET);
    console.log(`draft step: 1351 kare, meta ${JSON.stringify(video.meta)}`);
  }, 900_000);
});
