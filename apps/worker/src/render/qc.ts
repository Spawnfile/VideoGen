import { execFile } from 'node:child_process';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QC_LIMITS, type QcMeasure, type Span } from '@videogen/shared';
import { capture, extractFrame, ffprobeOf } from './ffmpeg.ts';

const num = (s: string) => (s === '-inf' ? Number.NEGATIVE_INFINITY : Number(s));

/** ebur128 summary (peak=true): integrated loudness, loudness range, true peak. */
export function parseEbur128(stderr: string): { i: number; lra: number; tp: number } | null {
  const i = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf) LUFS/.exec(stderr);
  const lra = /Loudness range:\s*\n\s*LRA:\s*([\d.]+) LU/.exec(stderr);
  const tp = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS/.exec(stderr);
  return i && lra && tp ? { i: num(i[1]!), lra: Number(lra[1]), tp: num(tp[1]!) } : null;
}

const SPAN = {
  silence: [/silence_start: (-?[\d.]+)/g, /silence_end: (-?[\d.]+)/g],
  black: [/black_start:(-?[\d.]+)/g, /black_end:(-?[\d.]+)/g],
  freeze: [/freeze_start: (-?[\d.]+)/g, /freeze_end: (-?[\d.]+)/g],
} as const;

/** start/end pairs in log order; a start without an end runs to the end of the file. */
export function parseSpans(stderr: string, kind: keyof typeof SPAN, durationS: number): Span[] {
  const [s, e] = SPAN[kind];
  const starts = [...stderr.matchAll(s)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...stderr.matchAll(e)].map((m) => Number(m[1]));
  return starts.map((start, i) => ({ start, end: ends[i] ?? durationS }));
}

/** End of a leading silence (≤ 10 ms from 0); null when the silence covers the whole file. */
export function firstAudio(leading: Span[], durationS: number): number | null {
  const lead = leading.find((x) => x.start <= 0.01);
  if (!lead) return 0;
  return lead.end >= durationS - 0.01 ? null : Math.round(lead.end * 1000) / 1000;
}

export function parseYavg(text: string): number[] {
  return [...text.matchAll(/lavfi\.signalstats\.YAVG=(-?[\d.]+)/g)].map((m) => Number(m[1]));
}

/** Spec §8.1 G5: a flash is a brightness jump ≥ 20/255 that reverses within 3 frames; the most flashes in any 1 s window. */
export function flashStats(yavg: number[], fps: number): { maxPerS: number; at: number | null } {
  const d = QC_LIMITS.flashDelta;
  const flashes: number[] = [];
  for (let i = 1; i < yavg.length; i++) {
    const up = yavg[i]! - yavg[i - 1]!;
    if (Math.abs(up) < d) continue;
    for (let j = i + 1; j <= Math.min(yavg.length - 1, i + 3); j++) {
      const back = yavg[j]! - yavg[j - 1]!;
      if (Math.abs(back) >= d && Math.sign(back) !== Math.sign(up)) { flashes.push(i); break; }
    }
  }
  let best = 0;
  let at: number | null = null;
  for (const f of flashes) {
    const n = flashes.filter((g) => g >= f && g < f + fps).length;
    if (n > best) { best = n; at = Math.round((f / fps) * 100) / 100; }
  }
  return { maxPerS: best, at };
}

/** Edge density (0..1) per band series sampled at `fps`; the worst band and time. */
export function edgeMax(series: number[][], fps: number): { maxDensity: number; at: number | null } {
  let maxDensity = 0;
  let at: number | null = null;
  for (const s of series) s.forEach((y, i) => { const v = Math.round((y / 255) * 1000) / 1000; if (v > maxDensity) { maxDensity = v; at = i / fps; } });
  return { maxDensity, at };
}

/** Top-level MP4 boxes from the head of a file (size 1 = 64-bit size, 0 = to the end). */
export function mp4TopBoxes(buf: Buffer): string[] {
  const out: string[] = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    out.push(type);
    if (size === 1) { if (off + 16 > buf.length) break; size = Number(buf.readBigUInt64BE(off + 8)); }
    if (size === 0 || size < 8) break;
    off += size;
  }
  return out;
}

const probeJson = (ffmpeg: string, args: string[], signal?: AbortSignal) => new Promise<string>((resolve, reject) => {
  execFile(ffprobeOf(ffmpeg), ['-v', 'error', ...args], { timeout: 120_000, signal, maxBuffer: 32 * 1024 * 1024 }, (err, out) => (err ? reject(new Error(`ffprobe: ${(err as Error).message.split('\n')[0]}`)) : resolve(String(out))));
});

/** Plan E14: everything evaluateQc needs, in a handful of ffmpeg/ffprobe passes. */
export async function probeQc(ffmpeg: string, file: string, o: { video?: boolean; edges?: boolean; signal?: AbortSignal }): Promise<QcMeasure> {
  const sig = o.signal;
  const j = JSON.parse(await probeJson(ffmpeg, ['-show_entries', 'stream=codec_type,codec_name,profile,width,height,r_frame_rate,pix_fmt,color_range,color_space,color_primaries,color_transfer,nb_frames,bit_rate,sample_rate:format=duration,size,bit_rate', '-of', 'json', file], sig)) as { streams: Record<string, string | number>[]; format: Record<string, string> };
  const v = j.streams.find((s) => s.codec_type === 'video') ?? {};
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const str = (x: unknown) => (x === undefined || x === 'unknown' ? null : String(x));
  const durationS = Number(j.format.duration ?? 0);
  const fps = (() => { const [n, d] = String(v.r_frame_rate ?? '30/1').split('/').map(Number); return d ? n! / d : 30; })();
  const keys = (await probeJson(ffmpeg, ['-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file], sig))
    // One time per line; ffprobe may append a separator ("0.000000,") and the output ends with an empty line (Number('') would be a fake key at 0).
    .split('\n').map((l) => l.trim()).filter(Boolean).map((l) => parseFloat(l)).filter((x) => Number.isFinite(x));
  const gaps = keys.map((k, i) => (i ? k - keys[i - 1]! : k)).concat(keys.length ? [durationS - keys.at(-1)!] : [durationS]);
  const fh = await open(file, 'r');
  const head = Buffer.alloc(65536);
  const { bytesRead } = await fh.read(head, 0, head.length, 0);
  await fh.close();
  const boxes = mp4TopBoxes(head.subarray(0, bytesRead));
  const tmp = await mkdtemp(join(tmpdir(), 'vg-qc-'));
  try {
    let yavg: number[] = [];
    let blacks: Span[] = [];
    let freezes: Span[] = [];
    let loopSsim: number | null = null;
    if (o.video !== false) {
      const yfile = join(tmp, 'yavg.txt');
      const err = await capture(ffmpeg, ['-i', file, '-an', '-vf', `signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=${yfile},blackdetect=d=${QC_LIMITS.blackS}:pix_th=0.10,freezedetect=n=0.001:d=${QC_LIMITS.freezeS}`, '-f', 'null', '-'], sig);
      yavg = parseYavg(await readFile(yfile, 'utf8').catch(() => ''));
      blacks = parseSpans(err, 'black', durationS);
      freezes = parseSpans(err, 'freeze', durationS);
      const first = join(tmp, 'first.png');
      const last = join(tmp, 'last.png');
      await extractFrame(ffmpeg, file, first, { t: 0, width: 540, signal: sig });
      await extractFrame(ffmpeg, file, last, { t: Math.max(0, durationS - 1.5 / fps), width: 540, signal: sig });
      const s = /All:([\d.]+)/.exec(await capture(ffmpeg, ['-i', last, '-i', first, '-lavfi', 'ssim', '-f', 'null', '-'], sig));
      loopSsim = s ? Number(s[1]) : null;
    }
    let edgeBands = { maxDensity: 0, at: null as number | null };
    if (o.edges) {
      const bands = ['iw:ih*150/1920:0:0', 'iw:ih-ih*1510/1920:0:ih*1510/1920', 'iw*130/1080:ih:iw-iw*130/1080:0'];
      const series: number[][] = [];
      for (const [k, crop] of bands.entries()) {
        const f = join(tmp, `edge${k}.txt`);
        await capture(ffmpeg, ['-i', file, '-an', '-vf', `fps=2,crop=${crop},edgedetect=low=0.1:high=0.3,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=${f}`, '-f', 'null', '-'], sig);
        series.push(parseYavg(await readFile(f, 'utf8').catch(() => '')));
      }
      edgeBands = edgeMax(series, 2);
    }
    let loudness: QcMeasure['loudness'] = null;
    let silences: Span[] = [];
    let firstAudioS: number | null = null;
    if (a) {
      const err = await capture(ffmpeg, ['-i', file, '-vn', '-af', `ebur128=peak=true:framelog=quiet,silencedetect=noise=${QC_LIMITS.silenceDb}dB:d=${QC_LIMITS.silenceS}`, '-f', 'null', '-'], sig);
      loudness = parseEbur128(err);
      const lead = await capture(ffmpeg, ['-t', '3', '-i', file, '-vn', '-af', `silencedetect=noise=${QC_LIMITS.silenceDb}dB:d=0.02`, '-f', 'null', '-'], sig);
      firstAudioS = firstAudio(parseSpans(lead, 'silence', Math.min(3, durationS)), Math.min(3, durationS) >= durationS ? durationS : Number.POSITIVE_INFINITY);
      silences = parseSpans(err, 'silence', durationS).filter((x) => firstAudioS !== null && x.start >= firstAudioS - 0.01);
    }
    const flash = o.video !== false ? flashStats(yavg, fps) : { maxPerS: 0, at: null };
    return {
      video: {
        codec: String(v.codec_name ?? ''), profile: str(v.profile), width: Number(v.width ?? 0), height: Number(v.height ?? 0), fps: String(v.r_frame_rate ?? ''), pixFmt: String(v.pix_fmt ?? ''),
        colorRange: str(v.color_range), colorSpace: str(v.color_space), colorPrimaries: str(v.color_primaries), colorTransfer: str(v.color_transfer),
        frames: Number(v.nb_frames ?? 0), durationS, bitrateKbps: Math.round(Number(v.bit_rate ?? j.format.bit_rate ?? 0) / 1000),
        maxGopFrames: Math.round(Math.max(...gaps) * fps), faststart: boxes.indexOf('moov') > -1 && (boxes.indexOf('mdat') === -1 || boxes.indexOf('moov') < boxes.indexOf('mdat')),
      },
      audio: a ? { codec: String(a.codec_name), sampleRate: Number(a.sample_rate) } : null,
      bytes: Number(j.format.size ?? (await stat(file)).size),
      loudness, firstAudioS, silences, blacks, freezes, flashMaxPerS: flash.maxPerS, flashAt: flash.at, loopSsim, edgeBands,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
