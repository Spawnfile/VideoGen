import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateQc } from '@videogen/shared';
import { masterAudio } from '../src/render/audio.ts';
import { encodeDelivery, fakeFinal, muxVariant } from '../src/render/ffmpeg.ts';
import { edgeMax, firstAudio, flashStats, mp4TopBoxes, parseEbur128, parseSpans, parseYavg, probeQc } from '../src/render/qc.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const D = mkdtempSync(join(tmpdir(), 'vg-qc-'));
const ff = (...args: string[]) => execFileSync(FFMPEG, ['-v', 'error', '-y', ...args]);
const failed = (r: { id: string; pass: boolean }[]) => r.filter((c) => !c.pass).map((c) => c.id).sort();
/**
 * A pilot-like clip (spec §8.3): 14 s, yuvj420p/pc tags, text-like stripes in the top unsafe band at 2–4 s, a 1.2 s freeze at 6 s
 * (the moving square is an overlay: drawbox cannot move), silence until 0.8 s and again 7–8.3 s, 4 s loud / 4 s quiet (LRA ≈ 17 LU)
 * around −29 LUFS.
 */
const PILOT = join(D, 'pilot.mp4');

beforeAll(() => {
  const stripes = [8, 14, 20, 26].map((y) => `drawbox=x=20:y=${y}:w=230:h=2:color=white:t=fill:enable='between(t,2,4)'`).join(',');
  ff('-f', 'lavfi', '-i', 'color=c=0x203040:s=270x480:r=30:d=14',
    '-f', 'lavfi', '-i', 'color=c=red:s=40x40:r=30', '-f', 'lavfi', '-i', 'anoisesrc=d=14:c=pink:r=48000:a=1:seed=9',
    '-filter_complex', `[0:v][1:v]overlay=x='mod(if(between(t,6,7.2),360,t*60),200)':y=200:shortest=1,${stripes}[v];[2:a]volume='if(lt(t,0.8)+between(t,7,8.3),0,if(lt(mod(t,8),4),0.2,0.03))':eval=frame[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuvj420p', '-color_range', 'pc', '-c:a', 'aac', '-ar', '48000', PILOT);
}, 60_000);

describe('qc_probe', () => {
  it('parses ebur128, silence/black/freeze spans and the first audible moment', () => {
    const eb = 'Summary:\n\n  Integrated loudness:\n    I:         -23.4 LUFS\n    Threshold: -33.9 LUFS\n\n  Loudness range:\n    LRA:        20.6 LU\n\n  True peak:\n    Peak:       -3.1 dBFS';
    expect(parseEbur128(eb)).toEqual({ i: -23.4, lra: 20.6, tp: -3.1 });
    expect(parseEbur128('nothing')).toBeNull();
    const sil = '[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 0.8 | silence_duration: 0.8\n[silencedetect @ 0x1] silence_start: 12.1\n[silencedetect @ 0x1] silence_end: 13.4 | silence_duration: 1.3\n[silencedetect @ 0x1] silence_start: 44.5';
    expect(parseSpans(sil, 'silence', 45)).toEqual([{ start: 0, end: 0.8 }, { start: 12.1, end: 13.4 }, { start: 44.5, end: 45 }]);
    expect(parseSpans('[blackdetect @ 0x2] black_start:20 black_end:21.2 black_duration:1.2', 'black', 45)).toEqual([{ start: 20, end: 21.2 }]);
    expect(parseSpans('[freezedetect @ 0x3] lavfi.freezedetect.freeze_start: 6.03\n[freezedetect @ 0x3] lavfi.freezedetect.freeze_duration: 1.2\n[freezedetect @ 0x3] lavfi.freezedetect.freeze_end: 7.23', 'freeze', 14)).toEqual([{ start: 6.03, end: 7.23 }]);
    expect([firstAudio([{ start: 0, end: 0.79 }], 45), firstAudio([], 45), firstAudio([{ start: 0, end: 45 }], 45)]).toEqual([0.79, 0, null]);
  });

  it('counts flashes per second from frame brightness and finds edge density in the unsafe bands', () => {
    const steady = Array.from({ length: 90 }, () => 60);
    const flashy = steady.map((y, i) => (i >= 30 && i < 60 && i % 6 === 0 ? 200 : y));
    expect(flashStats(steady, 30)).toEqual({ maxPerS: 0, at: null });
    expect(flashStats(flashy, 30)).toEqual({ maxPerS: 5, at: 1 });
    expect(flashStats(steady.map((y, i) => (i >= 45 ? 180 : y)), 30).maxPerS).toBe(0); // a cut is not a flash
    expect(parseYavg('frame:0    pts:0       pts_time:0\nlavfi.signalstats.YAVG=23.5\nframe:1    pts:1       pts_time:0.0333\nlavfi.signalstats.YAVG=24\n')).toEqual([23.5, 24]);
    expect(edgeMax([[0, 2.55, 0], [0, 0, 25.5]], 2)).toEqual({ maxDensity: 0.1, at: 1 });
  });

  it('reads the top-level MP4 box order (faststart: moov before mdat)', () => {
    const a = join(D, 'fs.mp4');
    const b = join(D, 'nofs.mp4');
    ff('-f', 'lavfi', '-i', 'color=s=64x64:d=1', '-c:v', 'libx264', '-movflags', '+faststart', a);
    ff('-f', 'lavfi', '-i', 'color=s=64x64:d=1', '-c:v', 'libx264', b);
    const order = (f: string) => mp4TopBoxes(readFileSync(f).subarray(0, 65536)).filter((x) => x === 'moov' || x === 'mdat');
    expect(order(a)).toEqual(['moov', 'mdat']);
    expect(order(b)[0]).toBe('mdat');
  });

  it('catches the pilot\'s seven errors on a pilot-like clip (spec §8.3 calibration)', async () => {
    const m = await probeQc(FFMPEG, PILOT, { edges: true });
    expect(m.firstAudioS!).toBeGreaterThan(0.6);
    expect(m.freezes.length).toBeGreaterThan(0);
    expect(m.edgeBands.maxDensity).toBeGreaterThan(0.02);
    const f = failed(evaluateQc(m, { variant: 'music', layoutIssues: null, coverOk: true }));
    for (const id of ['g1_color', 'g6_edges', 'd6_loudness', 'd6_lra', 'd6_first_audio', 'd6_silence', 'd3_freeze']) expect(f).toContain(id);
  }, 120_000);

  it('passes a clean, mastered 36 s final on every check it can judge here (D7 bitrate and the loop are content dependent)', async () => {
    const master = join(D, 'm.mp4');
    const video = join(D, 'v.mp4');
    await fakeFinal(FFMPEG, master, { frames: 1081 });
    await encodeDelivery(FFMPEG, master, video, { preset: 'ultrafast' });
    const raw = join(D, 'raw.wav');
    ff('-f', 'lavfi', '-i', 'anoisesrc=d=36.1:c=pink:r=48000:a=0.2:seed=4', '-ac', '2', raw);
    const wav = join(D, 'mastered.wav');
    await masterAudio(FFMPEG, raw, wav);
    const final = join(D, 'final.mp4');
    await muxVariant(FFMPEG, video, wav, final);
    const m = await probeQc(FFMPEG, final, {});
    expect(m.edgeBands).toEqual({ maxDensity: 0, at: null });
    const f = failed(evaluateQc(m, { variant: 'music', layoutIssues: [], coverOk: true })).filter((id) => id !== 'd7_bitrate' && id !== 'd8_loop');
    expect(f).toEqual([]);
  }, 180_000);

  it('skips the picture analyses for the TikTok variant (same stream as the music variant)', async () => {
    const m = await probeQc(FFMPEG, PILOT, { video: false });
    expect([m.freezes, m.blacks, m.flashMaxPerS, m.loopSsim]).toEqual([[], [], 0, null]);
    expect(m.video.pixFmt).toBe('yuvj420p');
  }, 60_000);
});
