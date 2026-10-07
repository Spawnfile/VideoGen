import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, insertArtifact, listArtifacts, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, draftRenderExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver, type DraftInput, type RenderDriver } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8'));

function setup(render: RenderDriver = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 })) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-draft-step-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const scene: SceneDeps = { pool: t.pool, render, locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10 };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30, validator: ARTIFACT_VALIDATOR,
    memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene };
  return { dataDir, specs, deps };
}

/** A run whose build is done (the fake build of the pen), as the build step leaves it. */
async function built(deps: StepDeps, name = 'Tükenmez kalem') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (key: 'build' | 'draft_render', round = 0, attempt = 1): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt, round, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent', versionId: r.versionId, runDir,
    signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  const b = buildExecutor(deps);
  expect(await b.run(ctx('build'), await b.inputHash(ctx('build')))).toMatchObject({ status: 'done' });
  return { r, ctx };
}
const reviewArtifact = (runId: string, name = 'review-revise') => insertArtifact(t.pool, { runId, kind: 'draft_review', content: fx(name), meta: { round: 0, verdict: 'revise' } });

describe('draft_render step and the builder fix round', () => {
  it('records the draft MP4 (540×960, length, codec) and its cover; reuse accepts only a draft of the same round', async () => {
    const { deps } = setup();
    const { r, ctx } = await built(deps);
    const ex = draftRenderExecutor(deps);
    const hash = await ex.inputHash(ctx('draft_render'));
    expect(await ex.run(ctx('draft_render'), hash)).toEqual({ status: 'done', note: '540×960 · 0:02 · render 0 sn' });
    const rows = (await t.pool.query("SELECT kind, width, height, codec, duration_ms, meta FROM artifacts WHERE run_id = $1 AND kind LIKE 'draft_%' ORDER BY kind", [r.runId])).rows;
    expect(rows.map((x) => x.kind)).toEqual(['draft_cover', 'draft_video']);
    expect(rows[1]).toMatchObject({ width: 540, height: 960, codec: 'h264', meta: { round: 0, frames: 60, concurrency: 1 } });
    expect(rows[1].duration_ms).toBeGreaterThanOrEqual(1900);
    expect(await ex.reuse!(ctx('draft_render'), hash)).toBe(true);
    expect(await ex.reuse!(ctx('draft_render', 1), hash)).toBe(false);
  });

  it('a fix round that changed neither the GLB nor the scene spec is not rendered again: needs_human with the open findings', async () => {
    const fake = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    let drafts = 0;
    const counting: RenderDriver = { kind: 'fake', capabilities: () => fake.capabilities(), build: (i) => fake.build(i), stills: (i) => fake.stills(i), draft: (i) => { drafts++; return fake.draft(i); } , final: (i) => fake.final(i), compose: (i) => fake.compose(i) };
    const { deps } = setup(counting);
    const { r, ctx } = await built(deps, 'İnatçı kalem');
    const ex = draftRenderExecutor(deps);
    await ex.run(ctx('draft_render'), await ex.inputHash(ctx('draft_render')));
    await reviewArtifact(r.runId);
    const out = await ex.run(ctx('draft_render', 1), await ex.inputHash(ctx('draft_render', 1)));
    expect(out).toEqual({ status: 'needs_human', reason: 'Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi. Açık bulgular: Mekanizma çekimi, Hareket akışı.' });
    expect(drafts).toBe(1);
  });

  it('a draft that fails the spec §7.5 probe is rejected with the reasons and audited', async () => {
    const fake = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    const fullRange: RenderDriver = {
      kind: 'fake', capabilities: () => fake.capabilities(), build: (i) => fake.build(i), stills: (i) => fake.stills(i), final: (i) => fake.final(i), compose: (i) => fake.compose(i),
      draft: async (i: DraftInput) => {
        mkdirSync(dirname(i.outPath), { recursive: true });
        execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=540x960:r=30', '-frames:v', '60', '-c:v', 'libx264', '-pix_fmt', 'yuvj420p', '-color_range', 'pc', i.outPath]);
        return { file: i.outPath, frames: 60, ms: 1, concurrency: 1 };
      },
    };
    const { deps } = setup(fullRange);
    const { r, ctx } = await built(deps);
    const ex = draftRenderExecutor(deps);
    const out = await ex.run(ctx('draft_render'), await ex.inputHash(ctx('draft_render')));
    expect(out).toMatchObject({ status: 'failed', retry: false, error: expect.stringContaining('pix_fmt yuvj420p (yuv420p olmalı)') });
    expect((await listArtifacts(t.pool, r.videoId)).map((a) => a.kind)).not.toContain('draft_video');
    expect((await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE run_id = $1 AND action = 'render.draft_rejected'", [r.runId])).rows[0].n).toBe(1);
  });

  it('build round 1 resumes the last builder session with only the failed checks, and its new scene makes a new draft hash', async () => {
    const { deps, specs } = setup();
    const { r, ctx } = await built(deps, 'Kusurlu kalem');
    const render = draftRenderExecutor(deps);
    const first = await render.inputHash(ctx('draft_render'));
    await reviewArtifact(r.runId);
    const b = buildExecutor(deps);
    expect(await b.inputHash(ctx('build', 1))).not.toBe(await b.inputHash(ctx('build')));
    expect(await b.run(ctx('build', 1), await b.inputHash(ctx('build', 1)))).toMatchObject({ status: 'done' });
    const fix = specs.at(-1)!;
    expect(fix).toMatchObject({ role: 'builder', resume: true, claudeSessionId: specs[0]!.claudeSessionId });
    expect(fix.prompt).toContain('Taslak incelemesi (tur 0) taslağı geri gönderdi');
    expect(fix.prompt).toContain('"id":"mechanism_shot"');
    expect(fix.prompt).not.toContain('"id":"hero_frame0"');
    expect(await render.inputHash(ctx('draft_render', 1))).not.toBe(first);
  });
});
