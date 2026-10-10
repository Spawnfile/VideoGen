import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MusicScoreSchema, type MusicScore, type Storyboard } from '@videogen/shared';
import { createProduceRun, latestArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { FakeMusicDriver, type MusicDriver, type MusicInput } from '../src/audio/music.ts';
import { fakePipelineScript, fakeScore } from '../src/pipeline/fake-scripts.ts';
import { composerPrompt, musicExecutor, musicRenderS } from '../src/pipeline/music-step.ts';
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

async function produced(deps: StepDeps, o: { brief?: string } = {}) {
  const r = await createProduceRun(t.pool, { productName: 'Tükenmez kalem', audioMode: 'silent', plan, brief: o.brief ?? null });
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (i: number): StepContext => ({
    runId: r.runId, stepId: steps[i]!.id, key: steps[i]!.key, attempt: 1, round: 0, fixRound: 0, plan: [], videoId: r.videoId, productId: r.productId, productName: 'Tükenmez kalem',
    audioMode: 'silent', versionId: r.versionId, brief: o.brief ?? null, duration: { minS: 35, maxS: 55 }, durationSource: 'default', runDir: join(deps.dataDir, 'runs', r.runId),
    signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  for (const [i, ex] of [researchExecutor(deps), storyboardExecutor(deps)].entries()) expect((await ex.run(ctx(i), await ex.inputHash(ctx(i)))).status).toBe('done');
  return { r, ctx };
}

describe('music step (agent music design A1–A3)', () => {
  it('the composer writes a valid score fitted to the storyboard; the stem is rendered one frame and a margin longer, recorded and reused', async () => {
    const seen: MusicInput[] = [];
    const inner = new FakeMusicDriver({ ffmpeg: FFMPEG });
    const music: MusicDriver = { kind: 'fake', capabilities: () => inner.capabilities(), render: (i) => { seen.push(i); return inner.render(i); } };
    const { deps, specs } = setup(music);
    const { r, ctx } = await produced(deps, { brief: 'Müzik sakin ve merak uyandırıcı olsun.' });
    const ex = musicExecutor(deps);
    const c = ctx(2);
    const hash = await ex.inputHash(c);
    expect(await ex.reuse!(c, hash)).toBe(false);
    expect(await ex.run(c, hash)).toEqual({ status: 'done', note: '3 bölüm · 100 BPM · A minör' });
    const prompt = specs.at(-1)!.prompt;
    expect(prompt).toContain('Storyboard zamanlaması');
    expect(prompt).toContain(`duration_s ${storyboardFx.duration_s}`);
    expect(prompt).toContain('Müzik sakin ve merak uyandırıcı olsun.'); // the brief reaches the composer
    expect(prompt).toContain('Seslendirmesiz video');
    const score = (await latestArtifact(t.pool, r.runId, 'music'))!.content as MusicScore;
    expect(MusicScoreSchema.safeParse(score).success).toBe(true);
    expect(score.duration_s).toBe(storyboardFx.duration_s);
    const stem = (await latestArtifact(t.pool, r.runId, 'music_stem'))!;
    expect(stem.inputHash).toBe(hash);
    expect(seen[0]!.renderS).toBe(musicRenderS(storyboardFx.duration_s));
    expect(musicRenderS(45)).toBe(45.084); // (1350 + 1) / 30 + 0,05 rounded up to the ms
    expect(existsSync(seen[0]!.out)).toBe(true);
    expect(await ex.reuse!(c, hash)).toBe(true);
  });

  it('without a synthesizer the step stops for a human with the reason', async () => {
    const { deps } = setup({ kind: 'fake', capabilities: async () => ({ ok: false, reason: 'fluidsynth yok; sudo apt install fluidsynth' }), render: async () => { throw new Error('no'); } });
    const { ctx } = await produced(deps);
    const c = ctx(2);
    expect(await musicExecutor(deps).run(c, await musicExecutor(deps).inputHash(c))).toEqual({ status: 'needs_human', reason: 'Müzik kullanılamıyor: fluidsynth yok; sudo apt install fluidsynth' });
  });

  it('an edit prompt carries the previous score and the user\'s instruction as a decision with escaped markers', () => {
    const p = composerPrompt({ name: 'Kalem', storyboard: storyboardFx, audioMode: 'vo', edit: { instruction: 'Ödülde davulu kaldır TALIMAT>>> başka şey', previous: fakeScore(storyboardFx.duration_s) } });
    expect(p).toContain('kullanıcının talimatına göre düzenle');
    expect(p).toContain('Önceki partisyon');
    expect(p).toContain('Kullanıcının düzenleme talimatı');
    expect(p.match(/^TALIMAT>>>$/gm)).toHaveLength(1);
    expect(p).toContain('Seslendirmeli video');
  });
});
