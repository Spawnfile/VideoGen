import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, vi } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, getRunView } from '@videogen/db';
import type { createTestDb } from '../../../packages/db/test/helpers.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { pipelineExecutors } from '../src/pipeline/steps.ts';
import { importAsset } from '../src/assets.ts';
import { FakeAudioDriver } from '../src/audio/driver.ts';
import { finalHarness } from './final-helpers.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';

// importAsset dedupes by content: every run gets its own bed (a disabled earlier one must not be reused).
let beds = 0;
/** The M5b plan end to end: fake Claude drivers, fake render, real ffmpeg; resolves when the run is terminal. `vo`: the seslendirmeli plan with the fake TTS (M5c). */
export async function runEndToEnd(t: TestDb, name: string, opt: { vo?: boolean } = {}) {
  const mode = opt.vo ? 'vo' : 'silent';
  const h = finalHarness(t);
  if (opt.vo) h.deps.audio = new FakeAudioDriver();
  // An allowed music track (the mix loops it): with no music at all the SFX-only mix has silent gaps and fails the D6 audio checks, and the score with them.
  const bed = join(h.dataDir, 'bed.wav');
  execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', `anoisesrc=d=5:c=brown:r=48000:a=0.5:seed=${20 + beds++}`, '-ac', '2', bed]);
  writeFileSync(join(h.dataDir, 'bed.txt'), 'CC0 1.0 (test)');
  await importAsset(t.pool, h.dataDir, FFMPEG, { kind: 'music', file: bed, title: `Yatak ${name}`, spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: join(h.dataDir, 'bed.txt') });
  const o = new Orchestrator({ pool: t.pool, dataDir: h.dataDir, executors: pipelineExecutors(h.deps), tickMs: 20, retryDelayMs: 10, waitDelayMs: 40, timeTickMs: 30 });
  try {
    o.start();
    const run = await createProduceRun(t.pool, { productName: name, audioMode: mode, plan: producePlan(mode) });
    await o.startRun(run.runId);
    // Waits for any terminal state and its `run.*` audit (written after finish() has updated the video), so a stopped run fails with its reason instead of a timeout.
    await vi.waitFor(async () => {
      const status = (await getRunView(t.pool, run.runId))!.status;
      expect(['done', 'needs_human', 'failed', 'cancelled']).toContain(status);
      expect((await t.pool.query('SELECT 1 FROM audit_log WHERE run_id = $1 AND action = $2', [run.runId, `run.${status}`])).rowCount).toBe(1);
    }, { timeout: 200_000, interval: 500 });
    const end = (await getRunView(t.pool, run.runId))!;
    if (end.status !== 'done') throw new Error(`run ${end.status}: ${JSON.stringify(end.steps.map((s) => [s.key, s.status, s.note, s.error]))}`);
    return { run, h };
  } finally {
    o.stop();
    await h.stop();
    // The ledger is shared by this file's tests but the blob lives in this harness's data dir: take the track out again.
    await t.pool.query('UPDATE assets SET allowed = false WHERE title = $1', [`Yatak ${name}`]);
  }
}
