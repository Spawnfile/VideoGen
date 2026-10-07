import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatScore } from '@videogen/shared';
import { getBlob, getRunView, getVideoView, latestArtifact } from '@videogen/db';
import type { LayoutManifest } from '@videogen/remotion/layout';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { runEndToEnd } from '../test/e2e-helpers.ts';

/** M5c T9: a seslendirmeli run end to end (fake Claude + fake TTS + fake render, real ffmpeg). */
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

/** Mean level (dBFS) of [from, to) seconds of a file's audio. */
function levelDb(file: string, from: number, to: number): number {
  const raw = execFileSync(FFMPEG, ['-v', 'error', '-ss', String(from), '-t', String(to - from), '-i', file, '-af', 'pan=mono|c0=c0', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 27 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  let sum = 0;
  for (const x of f) sum += x * x;
  return 10 * Math.log10(sum / Math.max(1, f.length) + 1e-12);
}

describe('M5c voice end to end', () => {
  const starts = async (runId: string, key: string) => (await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'step.started' AND run_id = $1 AND data->>'key' = $2", [runId, key])).rows[0].n as number;

  it("end to end 'seslendirmeli': produce (vo) → voice → … → finalize; ready with its score; both variants carry the VO; captions in layout.json; a 'telaffuz' round rewinds to voice, keeps the timings and renders the final frames once", async () => {
    const { run, h } = await runEndToEnd(t, 'Tükenmez kalem telaffuz', { vo: true });
    // one voice round: voice ran twice and compose twice; the kept timings leave the scene alone, so the final frames were rendered once and the second pass reused them
    expect(await starts(run.runId, 'voice')).toBe(2);
    expect(await starts(run.runId, 'compose')).toBe(2);
    expect((await t.pool.query("SELECT count(*)::int AS n FROM artifacts WHERE run_id = $1 AND kind = 'final_frames'", [run.runId])).rows[0].n).toBe(1);
    const steps = (await getRunView(t.pool, run.runId))!.steps;
    expect(steps.find((s) => s.key === 'final_render')!.note).toBe('önceki geçerli çıktı kullanıldı');
    const rewind = (await t.pool.query("SELECT data FROM audit_log WHERE action = 'step.rewind' AND run_id = $1", [run.runId])).rows.map((r) => r.data);
    expect(rewind).toEqual([expect.objectContaining({ key: 'review', to: 'voice', round: 1, loop: 'final' })]);
    const tracks = (await t.pool.query("SELECT meta FROM artifacts WHERE run_id = $1 AND kind = 'voice_track' ORDER BY created_at", [run.runId])).rows.map((r) => r.meta);
    expect(tracks).toHaveLength(2);
    expect(tracks[1]).toMatchObject({ fixRound: 1, rebuild: false, voiceHash: null });
    const versions = (await t.pool.query('SELECT round, reason FROM versions WHERE video_id = $1 ORDER BY round', [run.videoId])).rows;
    expect(versions.map((v) => [v.round, v.reason])).toEqual([[0, expect.any(String)], [1, 'fix:voice']]);

    const view = (await getVideoView(t.pool, run.videoId))!;
    expect(view).toMatchObject({ status: 'ready' });
    expect(view.score).toBeGreaterThanOrEqual(80);
    expect(steps.find((s) => s.key === 'finalize')!.note).toBe(`Yayına hazır · ${formatScore(view.score!)} puan · düzeltme turu 1/3`);

    // both variants carry the VO (a mid-line window far from the scene's SFX events); the music final records the stem it was mixed with
    const music = (await latestArtifact(t.pool, run.runId, 'final_video_music'))!;
    const tiktok = (await latestArtifact(t.pool, run.runId, 'final_video_tiktok'))!;
    expect(music.meta).toMatchObject({ voiceStemSha: tracks[1].stemSha });
    for (const a of [music, tiktok]) expect(levelDb(join(h.dataDir, (await getBlob(t.pool, a.blobSha!))!.path), 18, 19)).toBeGreaterThan(-35);
    const layout = (await latestArtifact(t.pool, run.runId, 'layout'))!.content as LayoutManifest;
    expect(layout.captions).toBe(true);
    expect(layout.frames.some((f) => f.boxes.some((b) => b.kind === 'caption'))).toBe(true);
  }, 300_000);
});
