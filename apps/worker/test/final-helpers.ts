import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import type pg from 'pg';
import { producePlan, type StepKey } from '@videogen/shared';
import { createProduceRun, insertArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore } from '@videogen/claude';
import { SessionManager } from '../src/agents/manager.ts';
import { composeExecutor, finalRenderExecutor } from '../src/pipeline/final-steps.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

/** Fake Claude + fake render, real ffmpeg (delivery encode ultrafast), for the final steps' tests. */
export function finalHarness(t: { pool: pg.Pool }) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-final-h-'));
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10, encodePreset: 'ultrafast' };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene };
  async function run(name: string, through: StepKey[]) {
    const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
    const runDir = join(dataDir, 'runs', r.runId);
    const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
    for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
      await store.write(kind, fx(f));
      await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
    }
    const steps = await listRunSteps(t.pool, r.runId);
    const ctx = (key: StepKey): StepContext => ({
      runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
      versionId: r.versionId, runDir, signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
    });
    const ex = { build: buildExecutor(deps), final_render: finalRenderExecutor(deps), compose: composeExecutor(deps) } as const;
    for (const k of through) { const e = ex[k as keyof typeof ex]; expect(await e.run(ctx(k), await e.inputHash(ctx(k)))).toMatchObject({ status: 'done' }); }
    return { r, ctx, runDir };
  }
  return {
    dataDir, deps,
    framed: (name: string) => run(name, ['build', 'final_render']),
    composed: (name: string) => run(name, ['build', 'final_render', 'compose']),
    stop: () => manager.stop(),
  };
}
