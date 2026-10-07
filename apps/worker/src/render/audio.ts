import { execFile } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { capture, muxVariant } from './ffmpeg.ts';

const run = (ffmpeg: string, args: string[], signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 300_000, signal, maxBuffer: 16 * 1024 * 1024 }, (err, _o, e) => (err ? reject(new Error(`ffmpeg: ${String(e).trim().split('\n').at(-1)}`)) : resolve()));
});

/** Spec §7.6: SFX cues (adelay) and the music bed (looped, faded) over a silent stereo base of the video's length; no normalisation in amix. */
export function mixTrack(ffmpeg: string, o: { cues: { atMs: number; file: string; gainDb: number }[]; music?: { file: string; gainDb: number } | null; durationS: number; out: string; signal?: AbortSignal }): Promise<void> {
  const d = o.durationS;
  const args = ['-f', 'lavfi', '-t', String(d), '-i', 'anullsrc=r=48000:cl=stereo'];
  for (const c of o.cues) args.push('-i', c.file);
  if (o.music) args.push('-stream_loop', '-1', '-i', o.music.file);
  const parts: string[] = [];
  const labels = ['[0:a]'];
  o.cues.forEach((c, i) => {
    parts.push(`[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${c.atMs}|${c.atMs},volume=${c.gainDb}dB[c${i}]`);
    labels.push(`[c${i}]`);
  });
  if (o.music) {
    parts.push(`[${o.cues.length + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${d},afade=t=in:d=1,afade=t=out:st=${Math.max(0, d - 2)}:d=2,volume=${o.music.gainDb}dB[m]`);
    labels.push('[m]');
  }
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,atrim=0:${d}[out]`);
  return run(ffmpeg, [...args, '-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', o.out], o.signal);
}

export interface Loudnorm { i: number; tp: number; lra: number; thresh: number; offset: number }
/** The JSON block loudnorm prints with print_format=json ("-inf" for silence → NaN). */
export function parseLoudnormJson(stderr: string): Loudnorm | null {
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!m) return null;
  const j = JSON.parse(m[0]) as Record<string, string>;
  const n = (k: string) => Number(j[k]);
  return { i: n('input_i'), tp: n('input_tp'), lra: n('input_lra'), thresh: n('input_thresh'), offset: n('target_offset') };
}

/**
 * Spec §7.6: −14 LUFS, true peak ≤ −1 dBTP in the delivered file. The AAC encode of a variant overshoots the limiter by ~0.5–1.1 dB
 * (measured: −1.0 dBTP WAV → −0.4 dBTP MP4), so the master aims lower and masterVariant checks the encoded result.
 */
const loudnorm = (tp: number) => `loudnorm=I=-14:TP=${tp}:LRA=11`;
const MASTER_TP = -2;
export async function measureLoudnorm(ffmpeg: string, file: string, signal?: AbortSignal): Promise<Loudnorm | null> {
  return parseLoudnormJson(await capture(ffmpeg, ['-i', file, '-vn', '-af', `${loudnorm(MASTER_TP)}:print_format=json`, '-f', 'null', '-'], signal));
}

/** Plan E12: two-pass loudnorm (−14 LUFS, true peak `tp`, LRA 11) with the measured values, linear when possible; a silent input is copied. */
export async function masterAudio(ffmpeg: string, input: string, out: string, signal?: AbortSignal, tp = MASTER_TP): Promise<{ before: Loudnorm | null }> {
  const m = await measureLoudnorm(ffmpeg, input, signal);
  if (!m || !Number.isFinite(m.i) || !Number.isFinite(m.tp) || !Number.isFinite(m.offset)) {
    await copyFile(input, out);
    return { before: null };
  }
  const second = `${loudnorm(tp)}:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true,aresample=48000`;
  await run(ffmpeg, ['-i', input, '-af', second, '-ar', '48000', '-c:a', 'pcm_s16le', out], signal);
  return { before: m };
}

/** The delivered file's true-peak ceiling (spec §7.6) less a margin: loudnorm here and ebur128 in qc read true peak ~0.1 dB apart. */
const TP_CEILING = -1 - 0.3;

/**
 * Spec §7.6 variant: masters the mix (−14 LUFS, −2 dBTP), muxes it next to the video and measures the AAC result. When the encode pushed
 * the true peak over −1.3 dBTP, the mix is mastered again (≤ 3 times) with the limiter lowered by the overshoot (+0.3 dB): the loudness target
 * stays, only the peaks come down. Returns the mastering input measurement, the delivered true peak and the limiter target used.
 */
export async function masterVariant(ffmpeg: string, mix: string, video: string, out: string, signal?: AbortSignal): Promise<{ before: Loudnorm | null; tp: number | null; tpTarget: number }> {
  const wav = `${out}.wav`;
  let tpTarget = MASTER_TP;
  const { before } = await masterAudio(ffmpeg, mix, wav, signal, tpTarget);
  await muxVariant(ffmpeg, video, wav, out, signal);
  let m = await measureLoudnorm(ffmpeg, out, signal);
  // Up to three corrections (review #4): each lowers the limiter by the remaining overshoot.
  for (let i = 0; i < 3 && before && m && Number.isFinite(m.tp) && m.tp > TP_CEILING; i++) {
    tpTarget = Math.round((tpTarget - (m.tp - TP_CEILING) - 0.3) * 100) / 100;
    await masterAudio(ffmpeg, mix, wav, signal, tpTarget);
    await muxVariant(ffmpeg, video, wav, out, signal);
    m = await measureLoudnorm(ffmpeg, out, signal);
  }
  return { before, tp: m && Number.isFinite(m.tp) ? m.tp : null, tpTarget };
}
