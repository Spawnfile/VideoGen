import { expect, vi } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, getRunView } from '@videogen/db';
import type { createTestDb } from '../../../packages/db/test/helpers.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { pipelineExecutors } from '../src/pipeline/steps.ts';
import { finalHarness } from './final-helpers.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** The M5b plan end to end: fake Claude drivers, fake render, real ffmpeg; resolves when the run is terminal (the music step makes the fixed bed). */
/** `after`: runs with the orchestrator and the harness still up. */
export async function runEndToEnd(t: TestDb, name: string, opt: { after?: (x: { o: Orchestrator; h: ReturnType<typeof finalHarness>; run: Awaited<ReturnType<typeof createProduceRun>> }) => Promise<void> } = {}) {
  const mode = 'silent';
  const h = finalHarness(t);
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
    await opt.after?.({ o, h, run });
    return { run, h };
  } finally {
    o.stop();
    await h.stop();
  }
}
