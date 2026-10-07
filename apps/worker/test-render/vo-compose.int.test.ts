import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AudioPlanSchema, type Storyboard } from '@videogen/shared';
import { getBlob, insertArtifact, latestArtifact } from '@videogen/db';
import type { LayoutManifest } from '@videogen/remotion/layout';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { importAsset } from '../src/assets.ts';
import { RenderError } from '../src/render/driver.ts';
import { composeExecutor, composeSource } from '../src/pipeline/final-steps.ts';
import { putBlob } from '../src/media.ts';
import { voKey, type VoiceTrackMeta } from '../src/pipeline/voice-step.ts';
import { finalHarness } from '../test/final-helpers.ts';

// The executor's own mixes, kept before mastering (loudnorm's dynamic gain would blur the bed's level): [music variant, TikTok variant] per compose.
const mixes = vi.hoisted(() => [] as string[]);
vi.mock('../src/render/audio.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/audio.ts')>();
  return { ...m, mixTrack: async (...a: Parameters<typeof m.mixTrack>) => { await m.mixTrack(...a); const keep = join(tmpdir(), `vg-vocompose-mix-${process.pid}-${mixes.length}.wav`); copyFileSync(a[1].out, keep); mixes.push(keep); } };
});

/** M5c T7: compose of a seslendirmeli run (VO stem, ducking, captions, the audio plan). Real ffmpeg, fake Blender/Chrome. */
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const harnesses: ReturnType<typeof finalHarness>[] = [];
afterAll(async () => { for (const h of harnesses) await h.stop(); for (const f of mixes) rmSync(f, { force: true }); });

/** RMS (dBFS) of [from, to) seconds of an audio track. */
function rmsDb(file: string, from: number, to: number): number {
  const raw = execFileSync(FFMPEG, ['-v', 'error', '-ss', String(from), '-t', String(to - from), '-i', file, '-af', 'pan=mono|c0=c0', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 27 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  let sum = 0;
  for (const x of f) sum += x * x;
  return 10 * Math.log10(sum / Math.max(1, f.length) + 1e-12);
}

describe('compose in VO mode', () => {
  it('both variants carry the VO, captions in layout.json, the default AudioPlan persisted once; a stale voice track is refused', async () => {
    const h = finalHarness(t);
    harnesses.push(h);
    const { deps, dataDir } = h;
    const bed = join(dataDir, 'bed.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=white:r=48000:a=0.3:seed=5', '-ac', '2', bed]);
    const lic = join(dataDir, 'lic.txt');
    writeFileSync(lic, 'CC0 1.0 (test)');
    await importAsset(t.pool, dataDir, FFMPEG, { kind: 'music', file: bed, title: 'Test yatağı', spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: lic });
    const { r, ctx, runDir } = await h.framed('Kalem VO', { vo: true });

    // the voice step's outputs, as T5 writes them: a 45 s stem (a tone inside each line), the track and its key
    const board = fx('storyboard-kalem-vo') as Storyboard;
    // two lines far from the scene's SFX events (16 s, 24 s, 32 s, 40 s): 18–20 s and 34–36 s, so the bed can be probed around them
    const base = fx('voice-track-kalem');
    const lineOf = (id: string, start_ms: number, end_ms: number, i: number) => ({ ...base.lines[0], beat_id: id, start_ms, end_ms, seed: 1000 + i });
    const wordsOf = (id: string, from: number) => ['Asıl', 'iş', 'ise', 'ucunda'].map((text, i) => ({ text, beat_id: id, start_ms: from + 200 + i * 400, end_ms: from + 500 + i * 400 }));
    const track = { ...base, lines: [lineOf('b4-ikinci-kanca', 18_000, 20_000, 0), lineOf('b6-odul', 34_000, 36_000, 1)], words: [...wordsOf('b4-ikinci-kanca', 18_000), ...wordsOf('b6-odul', 34_000)], duration_ms: 45_000 };
    const gate = track.lines.map((l: { start_ms: number; end_ms: number }) => `between(t,${l.start_ms / 1000},${l.end_ms / 1000})`).join('+');
    const stemFile = join(runDir, 'stem.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='0.4*sin(2*PI*220*t)*(${gate})':d=45:s=48000`, '-ac', '1', stemFile]);
    const stem = await putBlob(t.pool, dataDir, stemFile);
    await insertArtifact(t.pool, { runId: r.runId, kind: 'voice_stem', blobSha: stem.sha256, inputHash: 'voice-hash' });
    const meta: VoiceTrackMeta = { fixRound: 0, rebuild: false, sourceStoryboardId: 'x', voKey: voKey(board), stemSha: stem.sha256, voiceHash: null };
    await insertArtifact(t.pool, { runId: r.runId, kind: 'voice_track', content: track, inputHash: 'voice-hash', meta });

    // H3: the default plan is written before the render, so a failing compose still leaves it (never variants without it)
    const crashing = composeExecutor({ ...deps, scene: { ...deps.scene!, render: { ...deps.scene!.render, compose: async () => { throw new RenderError('crash', 'compose çöktü (test)'); } } } as typeof deps.scene });
    expect(await crashing.run(ctx('compose'), await crashing.inputHash(ctx('compose')))).toMatchObject({ status: 'failed', error: 'compose çöktü (test)' });
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'audio'", [r.runId])).rows).toHaveLength(1);
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind LIKE 'final_video%'", [r.runId])).rows).toHaveLength(0);

    const ex = composeExecutor(deps);
    const hash = await ex.inputHash(ctx('compose'));
    expect(hash).not.toContain('missing');
    expect(await ex.run(ctx('compose'), hash)).toMatchObject({ status: 'done', note: expect.stringMatching(/^1080×1920 · 0:45 · \d+ efekt · müzik: Test yatağı · VO 0:45 · ducking 12 dB$/) });

    // the default plan is written once, and it is the plan the hash was made with
    const plans = (await t.pool.query("SELECT content FROM artifacts WHERE run_id = $1 AND kind = 'audio'", [r.runId])).rows;
    expect(plans).toHaveLength(1);
    expect(AudioPlanSchema.parse(plans[0].content)).toMatchObject({ mode: 'vo', music: { gain_db: -18 }, vo_gain_db: 0, duck_db: 12 });
    expect(await ex.inputHash(ctx('compose'))).toBe(hash);
    expect(await ex.reuse!(ctx('compose'), hash)).toBe(true);
    expect(await ex.run(ctx('compose'), hash)).toMatchObject({ status: 'done' });
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'audio'", [r.runId])).rows).toHaveLength(1);

    // captions are in layout.json and the music variant records the stem it was mixed with
    const layout = (await latestArtifact(t.pool, r.runId, 'layout'))!.content as LayoutManifest;
    expect(layout.captions).toBe(true);
    expect(layout.frames.some((f) => f.boxes.some((b) => b.kind === 'caption'))).toBe(true);
    const music = (await latestArtifact(t.pool, r.runId, 'final_video_music'))!;
    const tiktok = (await latestArtifact(t.pool, r.runId, 'final_video_tiktok'))!;
    expect(music.meta).toMatchObject({ voiceStemSha: stem.sha256 });

    // both variants have the voice; the TikTok one has no music (silence between the lines), the music one has the bed ducked under speech
    const file = async (sha: string) => join(dataDir, (await getBlob(t.pool, sha))!.path);
    const [m, k] = [await file(music.blobSha!), await file(tiktok.blobSha!)];
    expect(rmsDb(k, 18.5, 19.5)).toBeGreaterThan(-24); // inside the first line
    expect(rmsDb(m, 18.5, 19.5)).toBeGreaterThan(-24);
    expect(rmsDb(k, 17.5, 17.9)).toBeLessThan(-60); // the TikTok variant has no music (and no SFX in these windows)
    // H9 in the executor path: the bed alone, measured against a gap far from any line (27–29 s). Plateau = 150 ms before to 300 ms after a line,
    // 150 ms ramps outside it; a swapped or missing margin moves one of these probes.
    const mixMusic = mixes[0]!;
    const bedDb = (from: number, to: number) => rmsDb(mixMusic, from, to) - rmsDb(mixMusic, 27, 29);
    for (const [s0, e0] of [[18, 20], [34, 36]] as const) {
      expect(Math.abs(bedDb(s0 - 0.1, s0 - 0.03) + 12)).toBeLessThan(2); // just before the line: already ducked
      expect(bedDb(s0 - 0.29, s0 - 0.2)).toBeGreaterThan(-6); // 200–290 ms before: the ramp has hardly begun
      expect(Math.abs(bedDb(e0 + 0.05, e0 + 0.14) + 12)).toBeLessThan(2); // just after the line: still ducked
      expect(Math.abs(bedDb(e0 + 0.2, e0 + 0.28) + 12)).toBeLessThan(2); // the 300 ms tail
      expect(bedDb(e0 + 0.47, e0 + 0.57)).toBeGreaterThan(-1.5); // back at full level
    }

    // §8.3: a voice track of other words and times than the newest storyboard's is refused, in the hash and in the run
    const edited = { ...board, beats: board.beats.map((b, i) => (i === 0 ? { ...b, vo_text: { tr: 'Tamamen başka bir cümle.' } } : b)) };
    await insertArtifact(t.pool, { runId: r.runId, kind: 'storyboard', content: edited });
    const stale = { error: 'seslendirme güncel storyboard ile uyuşmuyor (bayat artefakt, §8.3)' };
    expect(await composeSource(deps, r.runId, r.videoId, 'vo')).toEqual(stale);
    expect(await ex.run(ctx('compose'), await ex.inputHash(ctx('compose')))).toEqual({ status: 'failed', error: stale.error, retry: false });
  }, 300_000);
});
