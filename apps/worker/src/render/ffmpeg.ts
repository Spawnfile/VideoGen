import { execFile } from 'node:child_process';
import { join } from 'node:path';

const run = (ffmpeg: string, args: string[], signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 60_000, signal }, (err, _o, stderr) => {
    if (err) reject(new Error(`ffmpeg: ${String(stderr).split('\n').filter(Boolean).at(-1) ?? (err as Error).message}`));
    else resolve();
  });
});

/** Spec §8.1 G6: no text above 150 px, below 1510 px or in the right 130 px of a 1080×1920 frame. Relative, so any scale. */
export const SAFE_AREA_FILTER = [
  'drawbox=x=0:y=0:w=iw:h=ih*150/1920:color=red@0.22:t=fill',
  'drawbox=x=0:y=ih*1510/1920:w=iw:h=ih-ih*1510/1920:color=red@0.22:t=fill',
  'drawbox=x=iw-iw*130/1080:y=0:w=iw*130/1080:h=ih:color=red@0.22:t=fill',
].join(',');

const hex = (c: string) => `0x${c.replace('#', '')}`;

/** The channel style backdrop (top → bottom), the same pair the Remotion layer draws behind transparent frames. */
export function gradientSource(bg: { top: string; bottom: string }, width: number, height: number): string {
  return `gradients=s=${width}x${height}:c0=${hex(bg.top)}:c1=${hex(bg.bottom)}:x0=0:y0=0:x1=0:y1=${height}:n=2:speed=0`;
}

/**
 * Spec §7.5: up to 8 stills (f*.png in `dir`, RGBA) on the style backdrop, as one 4×2 sheet of 270×480 tiles with the safe-area
 * overlay. `size` is the stills' own size (50 % previews: 540×960).
 */
export function contactSheet(ffmpeg: string, dir: string, out: string, o: { background?: { top: string; bottom: string }; size?: { width: number; height: number }; safeArea?: boolean; cols?: number; rows?: number; signal?: AbortSignal } = {}): Promise<void> {
  const tail = [...(o.safeArea === false ? [] : [SAFE_AREA_FILTER]), 'scale=270:480', `tile=${o.cols ?? 4}x${o.rows ?? 2}:padding=6:color=white`].join(',');
  const stills = ['-pattern_type', 'glob', '-i', `${dir}/f*.png`];
  if (!o.background) return run(ffmpeg, [...stills, '-vf', tail, '-frames:v', '1', out], o.signal);
  const { width, height } = o.size ?? { width: 540, height: 960 };
  return run(ffmpeg, ['-f', 'lavfi', '-i', gradientSource(o.background, width, height), ...stills, '-filter_complex', `[0:v][1:v]overlay=shortest=1:format=rgb,${tail}`, '-frames:v', '1', out], o.signal);
}

/** Fake render driver: a calm stand-in still (night-blue backdrop, a pen-like bar), not a loud test pattern in the UI. */
export function testStill(ffmpeg: string, out: string, o: { width: number; height: number; signal?: AbortSignal }): Promise<void> {
  const { width: w, height: h } = o;
  const bar = `drawbox=x=${Math.round(w * 0.45)}:y=${Math.round(h * 0.18)}:w=${Math.round(w * 0.1)}:h=${Math.round(h * 0.62)}:color=0x2f6bd8:t=fill`;
  return run(ffmpeg, ['-f', 'lavfi', '-i', `color=c=0x16203a:s=${w}x${h}:d=1`, '-vf', bar, '-frames:v', '1', out], o.signal);
}

/** ffprobe next to the configured ffmpeg (VG_FFMPEG), else the one on PATH. */
export const ffprobeOf = (ffmpeg: string) => (/ffmpeg$/.test(ffmpeg) ? ffmpeg.replace(/ffmpeg$/, 'ffprobe') : 'ffprobe');

/** Fake render driver (spec §16.1): a test-pattern draft tagged exactly like the real one, so it passes the same probe. */
export function fakeDraft(ffmpeg: string, out: string, o: { width: number; height: number; frames: number; signal?: AbortSignal }): Promise<void> {
  return run(ffmpeg, [
    // The calm stand-in of testStill (night-blue backdrop, a pen-like bar) that drifts, so the player visibly advances; no loud test pattern in the UI.
    '-f', 'lavfi', '-i', `color=c=0x16203a:s=${o.width}x${o.height}:r=30`,
    '-vf', `drawbox=x=${Math.round(o.width * 0.45)}+${Math.round(o.width * 0.15)}*sin(t*2):y=${Math.round(o.height * 0.18)}:w=${Math.round(o.width * 0.1)}:h=${Math.round(o.height * 0.62)}:color=0x2f6bd8:t=fill`,
    '-frames:v', String(o.frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out,
  ], o.signal);
}

export interface VideoProbe {
  codec: string; width: number; height: number; pixFmt: string; colorRange: string | null; colorSpace: string | null;
  colorPrimaries: string | null; colorTransfer: string | null; fps: string; frames: number; durationS: number;
}

/** First video stream of a file (spec §7.5 tags, frame count from the container). */
export function probeVideo(ffmpeg: string, file: string, signal?: AbortSignal): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    execFile(ffprobeOf(ffmpeg), ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=codec_name,width,height,pix_fmt,color_range,color_space,color_primaries,color_transfer,r_frame_rate,nb_frames:format=duration', '-of', 'json', file],
    { timeout: 30_000, signal }, (err, stdout) => {
      if (err) return reject(new Error(`ffprobe: ${(err as Error).message.split('\n')[0]}`));
      const j = JSON.parse(String(stdout)) as { streams?: Record<string, string | number>[]; format?: { duration?: string } };
      const s = j.streams?.[0];
      if (!s) return reject(new Error('ffprobe: video akışı yok'));
      const str = (k: string) => (s[k] === undefined || s[k] === 'unknown' ? null : String(s[k]));
      resolve({
        codec: String(s.codec_name), width: Number(s.width), height: Number(s.height), pixFmt: String(s.pix_fmt), colorRange: str('color_range'), colorSpace: str('color_space'),
        colorPrimaries: str('color_primaries'), colorTransfer: str('color_transfer'), fps: String(s.r_frame_rate), frames: Number(s.nb_frames), durationS: Number(j.format?.duration ?? 0),
      });
    });
  });
}

/** Spec §7.5 (grilling C16): what a draft must be; yuvj420p or pc range is rejected. Empty = acceptable. */
export function draftProbeErrors(p: VideoProbe, want: { width: number; height: number; frames: number }): string[] {
  const out: string[] = [];
  if (p.codec !== 'h264') out.push(`codec ${p.codec} (h264 olmalı)`);
  if (p.pixFmt !== 'yuv420p') out.push(`pix_fmt ${p.pixFmt} (yuv420p olmalı)`);
  if (p.colorRange !== 'tv') out.push(`color_range ${p.colorRange ?? 'yok'} (tv olmalı)`);
  for (const [k, v] of [['color_space', p.colorSpace], ['color_primaries', p.colorPrimaries], ['color_transfer', p.colorTransfer]] as const) if (v !== 'bt709') out.push(`${k} ${v ?? 'yok'} (bt709 olmalı)`);
  if (p.width !== want.width || p.height !== want.height) out.push(`boyut ${p.width}×${p.height} (${want.width}×${want.height} olmalı)`);
  if (p.fps !== '30/1') out.push(`kare hızı ${p.fps} (30/1 olmalı)`);
  if (p.frames !== want.frames) out.push(`kare sayısı ${p.frames} (${want.frames} olmalı)`);
  return out;
}

/**
 * One frame as PNG at `t` seconds (cover, contact sheets, extract_frames). `crop` is a fraction of the frame, enlarged 2× (spec §8.2);
 * `width` scales the whole frame (height follows).
 */
export function extractFrame(ffmpeg: string, video: string, out: string, o: { t: number; crop?: { x: number; y: number; w: number; h: number }; width?: number; signal?: AbortSignal }): Promise<void> {
  const vf = o.crop
    ? `crop=trunc(iw*${o.crop.w}/2)*2:trunc(ih*${o.crop.h}/2)*2:trunc(iw*${o.crop.x}):trunc(ih*${o.crop.y}),scale=iw*2:ih*2`
    : o.width ? `scale=${o.width}:-2` : 'null';
  return run(ffmpeg, ['-ss', String(o.t), '-i', video, '-frames:v', '1', '-vf', vf, out], o.signal);
}

export function ffmpegWorks(ffmpeg: string): Promise<boolean> {
  return new Promise((resolve) => { execFile(ffmpeg, ['-version'], { timeout: 5000 }, (err) => resolve(!err)); });
}

/** Fake final render (plan E17): `count` tiny transparent RGBA PNGs f00000.png… in one ffmpeg call. */
export function fakeFrames(ffmpeg: string, dir: string, count: number, signal?: AbortSignal): Promise<void> {
  return run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=black@0.0:s=54x96:r=30,format=rgba', '-frames:v', String(count), '-start_number', '0', join(dir, 'f%05d.png')], signal);
}
