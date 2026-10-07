import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatScore, producePlan, type QcReport, type StepKey } from '@videogen/shared';
import { getRunView, getVideoView, insertArtifact, latestArtifact } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { decideQc, qcExecutor } from '../src/pipeline/final-steps.ts';
import { finalHarness } from './final-helpers.ts';
import { runEndToEnd } from './e2e-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

describe('qc step and the M5a plan', () => {
  it('a failed gate stops the run for a human with the Turkish reason (layout text outside the safe area)', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Kalem taşma');
    const composeHash = (await latestArtifact(t.pool, r.runId, 'final_video_music'))!.inputHash;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'layout', inputHash: composeHash, content: { width: 1080, height: 1920, fps: 30, frames: [{ frame: 90, boxes: [{ kind: 'beat', box: [24, 1480, 900, 1560] }] }] } });
    const ex = qcExecutor(h.deps);
    expect(await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')))).toEqual({ status: 'needs_human', reason: 'Otomatik kontrol geçmedi: Güvenli alan: 1 kutu dışarıda (3,0 sn).' });
    const report = (await latestArtifact(t.pool, r.runId, 'qc_report'))!.content as QcReport;
    expect(decideQc(report, null)).toMatchObject({ status: 'needs_human' });
    // plan F6: with a review in the plan the failed gate goes to the review (done), not to a human
    expect(decideQc(report, null, true)).toEqual({ status: 'done', note: 'Otomatik kontrol geçmedi: Güvenli alan: 1 kutu dışarıda (3,0 sn). İnceleme düzeltmeye gönderecek.' });
    const withReview = { ...ctx('qc'), plan: ['qc', 'review'] as StepKey[] };
    expect(await ex.run(withReview, await ex.inputHash(withReview))).toMatchObject({ status: 'done', note: expect.stringMatching(/İnceleme düzeltmeye gönderecek\.$/) });
    await h.stop();
  }, 240_000);

  it('never checks a final made from an older scene (spec §8.3)', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Kalem bayat qc');
    const scene = fx('scene-kalem');
    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene', content: { ...scene, camera_keys: scene.camera_keys.map((k: { lens_mm: number }, i: number) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) } });
    const ex = qcExecutor(h.deps);
    expect(await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')))).toEqual({ status: 'failed', error: 'final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    await h.stop();
  }, 240_000);

  const endToEnd = (name: string) => runEndToEnd(t, name);
  const starts = async (runId: string, key: string) => (await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'step.started' AND run_id = $1 AND data->>'key' = $2", [runId, key])).rows[0].n as number;

  it('end to end (orchestrator, fake drivers): produce → … → review → finalize; the video is ready with its score; progress reaches 100 only at the end; frames deleted once', async () => {
    expect(producePlan('silent').map((s) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc', 'review', 'finalize']);
    const { run } = await endToEnd('Tükenmez kalem uçtan uca');
    const video = (await getVideoView(t.pool, run.videoId))!;
    expect(video).toMatchObject({ status: 'ready', statusNote: null });
    expect(video.score).toBeGreaterThanOrEqual(80);
    const steps = (await getRunView(t.pool, run.runId))!.steps;
    expect(steps.map((s) => [s.key, s.status])).toEqual(steps.map((s) => [s.key, 'done']));
    expect(steps.find((s) => s.key === 'finalize')!.note).toBe(`Yayına hazır · ${formatScore(video.score!)} puan`);
    expect((await latestArtifact(t.pool, run.runId, 'finish'))!.content).toMatchObject({ verdict: 'ready', round: 0, stop: null });
    expect((await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'frames.deleted' AND run_id = $1", [run.runId])).rows[0].n).toBe(1);
    const events = (await t.pool.query("SELECT payload FROM ui_events WHERE topic = 'runs' AND type = 'run.updated' AND payload->>'id' = $1 ORDER BY id", [run.runId])).rows.map((x) => x.payload as { progress: number; status: string });
    const series = events.map((x) => x.progress);
    expect(series).toEqual([...series].sort((a, b) => a - b));
    expect(events.filter((x) => x.progress >= 100).every((x) => x.status === 'done')).toBe(true);
    expect(series.at(-1)).toBe(100);
  }, 240_000);

});
