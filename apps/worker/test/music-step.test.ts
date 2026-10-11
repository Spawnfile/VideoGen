import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MusicScoreSchema, yaklasimScore, type MusicScore, type Storyboard } from '@videogen/shared';
import { createProduceRun, latestArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { FakeMusicDriver, type MusicDriver, type YaklasimMusicInput } from '../src/audio/music.ts';
import { fakePipelineScript, fakeScore } from '../src/pipeline/fake-scripts.ts';
import { musicExecutor, musicRenderS } from '../src/pipeline/music-step.ts';
import { researchExecutor, storyboardExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const storyboardFx = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts/storyboard-kalem.json'), 'utf8')) as Storyboard;
const plan = [{ key: 'research' as const, weight: 30 }, { key: 'storyboard' as const, weight: 30 }, { key: 'music' as const, weight: 40 }];

function setup(music?: MusicDriver) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-music-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 },
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, ...(music ? { music } : {}) };
  return { deps, specs };
}

async function produced(deps: StepDeps, o: { brief?: string; approach?: 'yaklasim' | null } = {}) {
  const r = await createProduceRun(t.pool, { productName: 'Tükenmez kalem', audioMode: 'silent', plan, brief: o.brief ?? null });
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (i: number): StepContext => ({
    runId: r.runId, stepId: steps[i]!.id, key: steps[i]!.key, attempt: 1, round: 0, fixRound: 0, plan: [], videoId: r.videoId, productId: r.productId, productName: 'Tükenmez kalem',
    audioMode: 'silent', versionId: r.versionId, brief: o.brief ?? null, duration: { minS: 12, maxS: 15 }, durationSource: 'default', approach: o.approach === undefined ? 'yaklasim' : o.approach, runDir: join(deps.dataDir, 'runs', r.runId),
    signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  for (const [i, ex] of [researchExecutor(deps), storyboardExecutor(deps)].entries()) expect((await ex.run(ctx(i), await ex.inputHash(ctx(i)))).status).toBe('done');
  return { r, ctx };
}

const proxy = (ys: YaklasimMusicInput[] = []): MusicDriver => {
  const inner = new FakeMusicDriver({ ffmpeg: FFMPEG });
  return { kind: 'fake', yaklasimCapabilities: () => inner.yaklasimCapabilities(), renderYaklasim: (i) => { ys.push(i); return inner.renderYaklasim(i); } };
};

describe('music step (agent music design A1–A3; YAKLASIM spec Y14)', () => {
  it('YAKLASIM: no composer session — the fixed 120 BPM A-minor score with a sparse macro section, rendered by the YAKLASIM generator, recorded and reused', async () => {
    const ys: YaklasimMusicInput[] = [];
    const { deps, specs } = setup(proxy(ys));
    const { r, ctx } = await produced(deps);
    const before = specs.length;
    const ex = musicExecutor(deps);
    const c = ctx(2);
    const hash = await ex.inputHash(c);
    expect(await ex.run(c, hash)).toEqual({ status: 'done', note: 'YAKLASIM · 120 BPM · A minör · seyrek davul: 1 makro' });
    expect(specs.length).toBe(before); // no Claude session for the music
    const score = (await latestArtifact(t.pool, r.runId, 'music'))!.content as MusicScore;
    expect(score).toEqual(yaklasimScore(storyboardFx));
    expect(ys).toEqual([expect.objectContaining({ durationS: musicRenderS(storyboardFx.duration_s), sparse: [[3.5, 5.5]] })]);
    expect((await latestArtifact(t.pool, r.runId, 'music_stem'))!.inputHash).toBe(hash);
    expect(await ex.reuse!(c, hash)).toBe(true);
  });

  it('the stem is one frame and a margin longer than the storyboard', () => {
    expect(musicRenderS(45)).toBe(45.084); // (1350 + 1) / 30 + 0,05 rounded up to the ms
  });

  it('without a synthesizer the step stops for a human with the reason (YAKLASIM: its own generator\'s capability)', async () => {
    const { deps } = setup({ kind: 'fake', yaklasimCapabilities: async () => ({ ok: false as const, reason: 'ses servisi Python\'u bulunamadı' }), renderYaklasim: async () => { throw new Error('no'); } });
    const y = await produced(deps);
    const cy = y.ctx(2);
    expect(await musicExecutor(deps).run(cy, await musicExecutor(deps).inputHash(cy))).toEqual({ status: 'needs_human', reason: 'Müzik kullanılamıyor: ses servisi Python\'u bulunamadı' });
    // Spec Z3: no composer — a pre-YAKLASIM run gets the same fixed generator (and its capability)
    const { ctx } = await produced(deps, { approach: null });
    const c = ctx(2);
    expect(await musicExecutor(deps).run(c, await musicExecutor(deps).inputHash(c))).toEqual({ status: 'needs_human', reason: 'Müzik kullanılamıyor: ses servisi Python\'u bulunamadı' });
  });
});
