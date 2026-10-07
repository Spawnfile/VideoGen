import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { producePlan, STEP_KEYS, type StepKey, type Storyboard } from '@videogen/shared';
import { createProduceRun, insertArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { FakeAudioDriver, type AudioDriver, type FakeAudioOptions, type VoiceInput, type VoiceOutput } from '../src/audio/driver.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { ResourceLocks } from '../src/render/locks.ts';
import { withResource } from '../src/render/gate.ts';
import type { Probe } from '../src/pipeline/resources.ts';
import { buildStem, voiceExecutor } from '../src/pipeline/voice-step.ts';
import type { StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext, StepOutcome } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';

export const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

const PROBE: Probe = { snapshot: async () => ({ memAvailableMb: 8000, swapUsedPct: 0, diskFreeMb: 100_000, vramFreeMb: 24_000, ollamaModels: null }) };

/** One call of the audio driver as the voice step made it, and who held the GPU lock at that moment. */
export interface VoiceCall { input: VoiceInput; holder: string | null }

/**
 * The voice step's setup (plan M5c T5): research + a VO storyboard as the source, a FakeAudioDriver that records its calls
 * (`tweak` can fail lines), the GPU lock and a pre-check probe like the orchestrator's, a fake Claude manager for the storyboard step.
 */
export function voiceHarness(t: { pool: pg.Pool }) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-voice-h-'));
  const locks = new ResourceLocks();
  const calls: VoiceCall[] = [];
  const opts: FakeAudioOptions = {};
  const o: { tweak?: (out: VoiceOutput) => VoiceOutput } = {};
  const fail: { error: Error | null } = { error: null };
  const audio: AudioDriver = {
    kind: 'fake',
    capabilities: (v, c) => new FakeAudioDriver().capabilities(v, c),
    async voice(i) {
      calls.push({ input: i, holder: locks.holder('gpu') });
      if (fail.error) throw fail.error;
      const out = await new FakeAudioDriver(opts).voice(i);
      return o.tweak ? o.tweak(out) : out;
    },
  };
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 },
  });
  const deps: StepDeps = { pool: t.pool, dataDir, manager, audio };
  // The ffmpeg mix takes ~0.7 s per stem (M5c time budget, H18): only the first-pass test runs it (`o.realStem`), the others store a stub.
  const o2 = { realStem: false, crashAfterStoryboard: false };
  const executor = voiceExecutor(deps, {
    stem: (f, i) => (o2.realStem ? buildStem(f, i) : Promise.resolve(writeFileSync(i.out, `stem ${i.lines.length} ${i.durationS}`))),
    afterStoryboard: () => { if (o2.crashAfterStoryboard) throw new Error('crash after the retimed storyboard'); },
  });

  /** A VO run with research and `source` (default: the kalem VO fixture) as the storyboarder's storyboard. */
  async function prepare(name: string, source: Storyboard = fx('storyboard-kalem-vo')) {
    const r = await createProduceRun(t.pool, { productName: name, audioMode: 'vo', plan: producePlan('vo', STEP_KEYS) });
    const runDir = join(dataDir, 'runs', r.runId);
    const steps = await listRunSteps(t.pool, r.runId);
    await insertArtifact(t.pool, { runId: r.runId, kind: 'research', content: fx('research-kalem') });
    /** Writes a storyboard the way the storyboarder or fixer does (a spec version + an artifact without retimedFrom). */
    const addSource = async (s: Storyboard) => {
      const w = await new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR).write('storyboard', s);
      if ('errors' in w) throw new Error(w.errors.join('; '));
      return (await insertArtifact(t.pool, { runId: r.runId, kind: 'storyboard', content: s, meta: { specVersion: w.version } })).id;
    };
    const sourceId = await addSource(source);
    const ctx = (key: StepKey, over: Partial<StepContext> = {}): StepContext => ({
      runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, fixRound: 0, plan: [], videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'vo',
      versionId: r.versionId, runDir, signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {}, ...over,
    });
    return { r, runDir, ctx, addSource, sourceId };
  }

  /** What the orchestrator does with the executor: hash, reuse, then run under the GPU lock. */
  async function exec(ctx: StepContext): Promise<StepOutcome> {
    const hash = await executor.inputHash(ctx);
    if (await executor.reuse!(ctx, hash)) return { status: 'done', note: 'önceki geçerli çıktı kullanıldı' };
    return withResource(locks, 'gpu', { owner: ctx.stepId, probe: PROBE, extraDiskMb: executor.extraDiskMb }, () => executor.run(ctx, hash));
  }
  const artifacts = async (runId: string, kind: string) => (await t.pool.query('SELECT id, content, meta, blob_sha, input_hash FROM artifacts WHERE run_id = $1 AND kind = $2 ORDER BY created_at', [runId, kind])).rows;

  return {
    get audioError() { return fail.error; }, set audioError(e: Error | null) { fail.error = e; },
    dataDir, deps, executor, calls, opts, o, flags: o2, specs, prepare, exec, artifacts, stop: async () => { await manager.stop(); rmSync(dataDir, { recursive: true, force: true }); } };
}
