import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { duckingEnvelope } from '../src/pipeline/sound.ts';
import { masterVariant, measureLoudnorm, mixTrack } from '../src/render/audio.ts';
import { encodeDelivery, fakeFinal } from '../src/render/ffmpeg.ts';

/** Moved out of `npm test` by the M5c time budget (plan H18: cumulative +20 s exceeded at T7); the ducking envelope itself stays pinned in sound.test.ts. */
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const gen = (out: string, src: string, ac = 2) => execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', src, '-ac', String(ac), '-ar', '48000', out]);
/** RMS (dBFS) of [from, to) seconds of a file, from raw float samples. */
function rmsDb(file: string, from: number, to: number): number {
  const raw = execFileSync(FFMPEG, ['-v', 'error', '-ss', String(from), '-t', String(to - from), '-i', file, '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  let sum = 0;
  for (const x of f) sum += x * x;
  return 10 * Math.log10(sum / Math.max(1, f.length) + 1e-12);
}

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe('mixing a voice stem (H9)', () => {
  it('the music is 12 ± 1,5 dB lower under speech than between lines; the TikTok mix has the VO and the SFX without music; masterVariant lands −14 ± 1 LUFS and ≤ −1 dBTP', async () => {
    const d = mkdtempSync(join(tmpdir(), 'vg-vomix-'));
    dirs.push(d);
    const music = join(d, 'bed.wav');
    const stem = join(d, 'stem.wav');
    const cue = join(d, 'cue.wav');
    gen(music, 'anoisesrc=d=6:c=pink:r=48000:a=0.2:seed=4');
    // a 6 s stem with speech-like tone bursts at 1.5–2.5 s and 4–5 s (the stem is already placed on the timeline)
    gen(stem, "aevalsrc='0.4*sin(2*PI*220*t)*(between(t,1.5,2.5)+between(t,4,5))':d=6:s=48000", 1);
    gen(cue, "aevalsrc='0.8*sin(2*PI*2400*t)*exp(-t*90)':d=0.06:s=48000");
    const lines = [{ start_ms: 1500, end_ms: 2500 }, { start_ms: 4000, end_ms: 5000 }];
    const duck = duckingEnvelope(lines, { duckDb: 12, preMs: 150, postMs: 300, rampMs: 150 });

    // the music alone, ducked: under speech vs between the lines (plateau 1.35–2.8 s and 3.85–5.3 s; the gap 3.1–3.7 s is full level)
    const ducked = join(d, 'ducked.wav');
    await mixTrack(FFMPEG, { cues: [], music: { file: music, gainDb: -18 }, duck, durationS: 6, out: ducked });
    const under = (rmsDb(ducked, 1.6, 2.4) + rmsDb(ducked, 4.1, 4.9)) / 2;
    const gap = rmsDb(ducked, 3.1, 3.7);
    expect(gap - under).toBeGreaterThan(10.5);
    expect(gap - under).toBeLessThan(13.5);

    // the TikTok variant: VO + SFX, no music; the music variant adds the ducked bed
    const tiktok = join(d, 'tiktok.wav');
    await mixTrack(FFMPEG, { cues: [{ atMs: 3200, file: cue, gainDb: -6 }], music: null, vo: { file: stem, gainDb: 0 }, duck: null, durationS: 6, out: tiktok });
    expect(rmsDb(tiktok, 1.6, 2.4)).toBeGreaterThan(-12); // the voice
    expect(rmsDb(tiktok, 0.2, 1.2)).toBeLessThan(-80); // nothing else: no music, SFX only at its cue
    expect(rmsDb(tiktok, 3.19, 3.27)).toBeGreaterThan(-30); // the SFX is there and is not ducked
    const withMusic = join(d, 'music.wav');
    await mixTrack(FFMPEG, { cues: [{ atMs: 3200, file: cue, gainDb: -6 }], music: { file: music, gainDb: -18 }, vo: { file: stem, gainDb: 0 }, duck, durationS: 6, out: withMusic });
    expect(rmsDb(withMusic, 3.19, 3.27)).toBeGreaterThan(rmsDb(withMusic, 0.2, 1.0) + 6); // the cue between lines still stands out of the bed

    // the voice keeps its level in the stereo mix (mono → both channels, no −3 dB), and an SFX cue inside a VO line is not ducked
    expect(Math.abs(rmsDb(tiktok, 1.6, 2.4) - rmsDb(stem, 1.6, 2.4))).toBeLessThan(0.5);
    const cueIn = (music: boolean) => mixTrack(FFMPEG, { cues: [{ atMs: 2000, file: cue, gainDb: -6 }], music: music ? { file: music_, gainDb: -18 } : null, duck: music ? duck : null, durationS: 6, out: join(d, `cue-${music}.wav`) });
    const music_ = music;
    await cueIn(true);
    await cueIn(false);
    expect(Math.abs(rmsDb(join(d, 'cue-true.wav'), 2.0, 2.06) - rmsDb(join(d, 'cue-false.wav'), 2.0, 2.06))).toBeLessThan(1);

    // mastering is unchanged by the voice
    const master = join(d, 'm.mp4');
    await fakeFinal(FFMPEG, master, { frames: 180 });
    const video = join(d, 'v.mp4');
    await encodeDelivery(FFMPEG, master, video, { preset: 'ultrafast' });
    const out = join(d, 'variant.mp4');
    const v = await masterVariant(FFMPEG, withMusic, video, out);
    expect(v.tp!).toBeLessThanOrEqual(-1);
    expect(Math.abs((await measureLoudnorm(FFMPEG, out))!.i + 14)).toBeLessThanOrEqual(1);
  });
});
