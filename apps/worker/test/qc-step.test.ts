import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QcReportSchema, producePlan, type QcReport } from '@videogen/shared';
import { createProduceRun, getRunView, getVideoView, insertArtifact, latestArtifact } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { decideQc, qcExecutor } from '../src/pipeline/final-steps.ts';
import { Orchestrator, PIPELINE_INCOMPLETE_NOTE } from '../src/pipeline/orchestrator.ts';
import { pipelineExecutors } from '../src/pipeline/steps.ts';
import { importAsset } from '../src/assets.ts';
import { finalHarness } from './final-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

describe('qc step and the M5a plan', () => {
  it('measures both variants and records the report; the note carries gates and the D6/D7 scores', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Tükenmez kalem');
    // Review #2: a music track added after the compose changes the next compose's hash, but this final is not stale.
    const bed = join(h.dataDir, 'late.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=5:c=brown:r=48000:a=0.3:seed=8', '-ac', '2', bed]);
    writeFileSync(join(h.dataDir, 'late.txt'), 'CC0 1.0 (test)');
    await importAsset(t.pool, h.dataDir, FFMPEG, { kind: 'music', file: bed, title: 'Geç yatak', spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: join(h.dataDir, 'late.txt') });
    const ex = qcExecutor(h.deps);
    const out = await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')));
    expect(out).toMatchObject({ status: 'done', note: expect.stringMatching(/^G1 ✓ G5 ✓ G6 ✓ · D6 \d+\/12 · D7 \d\/5/) });
    const rep = (await latestArtifact(t.pool, r.runId, 'qc_report'))!;
    expect(QcReportSchema.safeParse(rep.content).success).toBe(true);
    expect((rep.content as { tiktok: { id: string }[] }).tiktok.map((c) => c.id)).toContain('g1_color');
    // The ledger is shared by this file's tests but the blob lives in this harness's data dir: take the late track out again.
    await t.pool.query("UPDATE assets SET allowed = false WHERE title = 'Geç yatak'");
    await h.stop();
  }, 240_000);

  it('a failed gate stops the run for a human with the Turkish reason (layout text outside the safe area)', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Kalem taşma');
    const composeHash = (await latestArtifact(t.pool, r.runId, 'final_video_music'))!.inputHash;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'layout', inputHash: composeHash, content: { width: 1080, height: 1920, fps: 30, frames: [{ frame: 90, boxes: [{ kind: 'beat', box: [24, 1480, 900, 1560] }] }] } });
    const ex = qcExecutor(h.deps);
    expect(await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')))).toEqual({ status: 'needs_human', reason: 'Otomatik kontrol geçmedi: Güvenli alan: 1 kutu dışarıda (3,0 sn).' });
    expect(decideQc((await latestArtifact(t.pool, r.runId, 'qc_report'))!.content as QcReport, null)).toMatchObject({ status: 'needs_human' });
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

  it('end to end (orchestrator, fake drivers): produce → … → qc; the video waits for M5b with the qc note; frames are deleted; progress is monotone', async () => {
    const h = finalHarness(t);
    expect(producePlan('silent').map((s) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc']);
    const o = new Orchestrator({ pool: t.pool, dataDir: h.dataDir, executors: pipelineExecutors(h.deps), tickMs: 20, retryDelayMs: 10, waitDelayMs: 40, timeTickMs: 30 });
    o.start();
    const run = await createProduceRun(t.pool, { productName: 'Tükenmez kalem uçtan uca', audioMode: 'silent', plan: producePlan('silent') });
    await o.startRun(run.runId);
    await vi.waitFor(async () => expect((await getRunView(t.pool, run.runId))!.status).toBe('done'), { timeout: 200_000, interval: 500 });
    o.stop();
    expect(await getVideoView(t.pool, run.videoId)).toMatchObject({ status: 'needs_human', statusNote: PIPELINE_INCOMPLETE_NOTE('qc') });
    expect(PIPELINE_INCOMPLETE_NOTE('qc')).toBe('Final video hazır ve otomatik kontrolden geçti. İnceleme ve "yayına hazır" kararı M5b\'de.');
    const steps = (await getRunView(t.pool, run.runId))!.steps;
    expect(steps.map((s) => [s.key, s.status])).toEqual(steps.map((s) => [s.key, 'done']));
    expect((await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'frames.deleted' AND run_id = $1", [run.runId])).rows[0].n).toBe(1);
    const series = (await t.pool.query("SELECT payload FROM ui_events WHERE topic = 'runs' AND type = 'run.updated' AND payload->>'id' = $1 ORDER BY id", [run.runId])).rows.map((x) => x.payload.progress as number);
    expect(series).toEqual([...series].sort((a, b) => a - b));
    await h.stop();
  }, 240_000);
});
