import { execFile } from 'node:child_process';
import type { Storyboard } from '@videogen/shared';

/**
 * Agent music design A11: what reviewer_audio can know of the mix without hearing it — measured loudness curves of the stems, the music's
 * level while the voice speaks, and the music's energy change around the hook, the rehook and the payoff.
 */
export const WINDOW_S = 0.5;
const SR = 8000;
const FLOOR_DB = -90;

export interface AudioFacts {
  windowS: number;
  /** dBFS RMS per window, one decimal; null: no such stem in this final. */
  music: number[] | null;
  sfx: number[] | null;
  moments: { name: 'kanca' | 'ikinci kanca' | 'ödül'; t: number; beforeDb: number | null; afterDb: number; liftDb: number | null }[];
  musicRangeDb: { min: number; max: number } | null;
}

/** dBFS RMS per window of a file, decoded mono at 8 kHz by ffmpeg. */
export function rmsCurve(ffmpeg: string, file: string, windowS = WINDOW_S, signal?: AbortSignal): Promise<number[]> {
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, timeout: 60_000, signal }, (err, out) => {
      if (err) return reject(new Error(`ffmpeg: ${(err as Error).message.split('\n')[0]}`));
      const buf = out as Buffer;
      const n = Math.floor(buf.length / 4);
      const per = Math.round(windowS * SR);
      const curve: number[] = [];
      for (let w = 0; w * per < n; w++) {
        let sum = 0;
        const end = Math.min(n, (w + 1) * per);
        for (let k = w * per; k < end; k++) { const x = buf.readFloatLE(k * 4); sum += x * x; }
        const rms = Math.sqrt(sum / Math.max(1, end - w * per));
        curve.push(Math.round(Math.max(FLOOR_DB, 20 * Math.log10(rms || 1e-9)) * 10) / 10);
      }
      resolve(curve);
    });
  });
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function audioFacts(o: { music: number[] | null; sfx: number[] | null; storyboard: Storyboard; windowS?: number }): AudioFacts {
  const w = o.windowS ?? WINDOW_S;
  const at = (t: number) => Math.max(0, Math.floor(t / w));
  const sb = o.storyboard;
  const moments: AudioFacts['moments'] = o.music ? ([['kanca', 0], ['ikinci kanca', sb.rehook_at], ['ödül', sb.payoff_at]] as const).map(([name, t]) => {
    const m = o.music!;
    // Two seconds before vs one second from the moment (the hook has no "before": its level stands alone).
    const before = t >= 2 * w ? mean(m.slice(at(t - 2), at(t))) : null;
    const after = mean(m.slice(at(t), at(t + 1) + 1))!;
    return { name, t, beforeDb: before, afterDb: after, liftDb: before !== null ? Math.round((after - before) * 10) / 10 : null };
  }) : [];
  const audible = o.music?.filter((x) => x > FLOOR_DB) ?? [];
  return {
    windowS: w, music: o.music, sfx: o.sfx, moments,
    musicRangeDb: audible.length ? { min: Math.min(...audible), max: Math.max(...audible) } : null,
  };
}
