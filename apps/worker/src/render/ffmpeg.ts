import { execFile } from 'node:child_process';

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

export function ffmpegWorks(ffmpeg: string): Promise<boolean> {
  return new Promise((resolve) => { execFile(ffmpeg, ['-version'], { timeout: 5000 }, (err) => resolve(!err)); });
}
