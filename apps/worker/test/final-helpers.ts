import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import type pg from 'pg';
import { buildQcReport, IMPLEMENTED_STEPS, producePlan, QC_CHECKS, type QcCheckResult, type QcReport, type StepKey } from '@videogen/shared';
import { createProduceRun, insertArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { SessionManager } from '../src/agents/manager.ts';
import { putBlob } from '../src/media.ts';
import { fakeFinal } from '../src/render/ffmpeg.ts';
import { ReviewTargets, reviewToolHost, toolHosts } from '../src/pipeline/review-tools.ts';
import { composeExecutor, finalRenderExecutor, finalSource } from '../src/pipeline/final-steps.ts';
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
      runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, fixRound: 0, plan: [], videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
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

/** A music + TikTok qc report where every check passes except the given ids (the default: one soft D7 check, so the fixture panel totals 87.5). */
export function qcReportFailing(failing: string[] = ['d7_bitrate']): QcReport {
  const variant = (v: 'music' | 'tiktok'): QcCheckResult[] => (Object.keys(QC_CHECKS) as (keyof typeof QC_CHECKS)[])
    .filter((id) => QC_CHECKS[id].variants.includes(v)).map((id) => ({ id, pass: !failing.includes(id), value: 'x', limit: 'y' }));
  return buildQcReport(variant('music'), variant('tiktok'));
}

/**
 * The review step's setup without compose (plan T7): research, storyboard, scene, a tiny scene_blend, a 60-frame (2 s) fake final as
 * final_video_music (framesHash = the current finalSource hash) and a qc_report (musicSha). Fake Claude with the review tools; every
 * started session spec is kept in `specs`.
 */
export function panelHarness(t: { pool: pg.Pool }) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-panel-h-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10, encodePreset: 'ultrafast' };
  const reviews = new ReviewTargets();
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 },
    tools: toolHosts(sceneToolHost(scene), reviewToolHost({ ffmpeg: FFMPEG, targets: reviews })),
  });
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene, reviews };
  /** `qc`: the check ids that fail in the qc report (a gate id makes the AUTO gate fail). */
  async function prepare(name: string, o: { qc?: string[]; musicShaInQc?: string } = {}) {
    const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent', [...IMPLEMENTED_STEPS, 'review']) });
    const runDir = join(dataDir, 'runs', r.runId);
    for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem'], ['scene', 'scene-kalem']] as const) await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
    const dir = join(runDir, 'final', 'compose');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'scene.blend'), 'blend');
    const blend = await putBlob(t.pool, dataDir, join(dir, 'scene.blend'));
    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene_blend', blobSha: blend.sha256 });
    await fakeFinal(FFMPEG, join(dir, 'final_music.mp4'), { frames: 60 });
    const music = await putBlob(t.pool, dataDir, join(dir, 'final_music.mp4'));
    const framesHash = (await finalSource(deps, r.runId))!.hash;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'final_video_music', blobSha: music.sha256, inputHash: 'compose-hash', meta: { music: null, framesHash }, durationMs: 2000, width: 1080, height: 1920, codec: 'h264' });
    const report = qcReportFailing(o.qc);
    const qc = await insertArtifact(t.pool, { runId: r.runId, kind: 'qc_report', content: report, inputHash: 'qc-hash', meta: { pass: report.pass, musicSha: o.musicShaInQc ?? music.sha256 } });
    const steps = await listRunSteps(t.pool, r.runId);
    const ctx = (key: StepKey, over: Partial<StepContext> = {}): StepContext => ({
      runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, fixRound: 0, plan: ['qc', 'review'], videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
      versionId: r.versionId, runDir, signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {}, ...over,
    });
    return { r, ctx, runDir, musicSha: music.sha256, qcId: qc.id, report };
  }
  /** Roles of the agent sessions a step opened (sorted; a role per session, so a second visual review shows twice). */
  const sessionRoles = async (stepId: string) => (await t.pool.query('SELECT role FROM agent_sessions WHERE step_id = $1 ORDER BY role, created_at', [stepId])).rows.map((x) => x.role as string);
  return { dataDir, deps, specs, prepare, sessionRoles, stop: async () => { await manager.stop(); rmSync(dataDir, { recursive: true, force: true }); } };
}
