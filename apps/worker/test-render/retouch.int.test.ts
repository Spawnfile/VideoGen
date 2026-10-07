import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatScore } from '@videogen/shared';
import { getRunView, getVideoView } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { runEndToEnd } from '../test/e2e-helpers.ts';

/** The 'rötuş' fix round end to end (fake drivers, fake render, real ffmpeg). Moved out of `npm test` by the plan's F21 rule (npm test over 6 min). */
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('M5b fix loop end to end', () => {
  const endToEnd = (name: string) => runEndToEnd(t, name);
  const starts = async (runId: string, key: string) => (await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'step.started' AND run_id = $1 AND data->>'key' = $2", [runId, key])).rows[0].n as number;

  it("end to end 'rötuş': one compose-scope round; final_render ran once (frames reused); version 2 is best; review note 'düzeltme turu 1/3'; ready", async () => {
    const { run } = await endToEnd('Tükenmez kalem rötuş');
    expect(await starts(run.runId, 'final_render')).toBe(1);
    expect(await starts(run.runId, 'compose')).toBe(2);
    const fixRounds = (await t.pool.query("SELECT key, fix_round FROM steps WHERE run_id = $1 AND key IN ('compose', 'qc', 'review')", [run.runId])).rows;
    expect(Object.fromEntries(fixRounds.map((r) => [r.key, r.fix_round]))).toEqual({ compose: 1, qc: 1, review: 1 });
    const video = (await t.pool.query('SELECT best_version_id, current_version_id FROM videos WHERE id = $1', [run.videoId])).rows[0];
    const versions = (await t.pool.query('SELECT id, round, reason FROM versions WHERE video_id = $1 ORDER BY round', [run.videoId])).rows;
    expect(versions.map((v) => [v.round, v.reason])).toEqual([[0, expect.any(String)], [1, 'fix:compose']]);
    expect(video.best_version_id).toBe(versions[1].id);
    expect(video.current_version_id).toBe(versions[1].id);
    const view = (await getVideoView(t.pool, run.videoId))!;
    expect(view).toMatchObject({ status: 'ready' });
    expect(view.score).toBeGreaterThanOrEqual(80);
    const steps = (await getRunView(t.pool, run.runId))!.steps;
    expect(steps.find((s) => s.key === 'finalize')!.note).toBe(`Yayına hazır · ${formatScore(view.score!)} puan · düzeltme turu 1/3`);
    const rewind = (await t.pool.query("SELECT data FROM audit_log WHERE action = 'step.rewind' AND run_id = $1", [run.runId])).rows.map((r) => r.data);
    expect(rewind).toEqual([expect.objectContaining({ key: 'review', to: 'compose', round: 1, loop: 'final' })]);
  }, 240_000);});
