import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { renderSafeAreaCard } from '@videogen/remotion/render';
import { probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const DATA = mkdtempSync(join(tmpdir(), 'vg-safe-area-card-int-'));
afterAll(() => { if (!process.env.VG_KEEP) rmSync(DATA, { recursive: true, force: true }); });
/** Mean RGB of a w×h region of a still. */
const region = (file: string, x: number, y: number, w: number, h: number) =>
  [...execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `crop=${w}:${h}:${x}:${y},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
const luma = (c: number[]) => (c[0]! + c[1]! + c[2]!) / 3;

describe('safe-area calibration card (plan M7 Y16, Y17; real system Chrome)', () => {
  it('the calibration card renders through renderStill to a 1080×1920 PNG and a 5 s MP4 with the rulers', async () => {
    const r = await renderSafeAreaCard({ outDir: join(DATA, 'calibration'), cacheRoot: join(DATA, 'cache') });
    expect(r.png).toBe(join(DATA, 'calibration', 'safe-area-card.png'));
    expect(r.mp4).toBe(join(DATA, 'calibration', 'safe-area-card.mp4'));
    const still = await probeVideo(FFMPEG, r.png);
    expect([still.width, still.height]).toEqual([1080, 1920]);
    const v = await probeVideo(FFMPEG, r.mp4);
    expect([v.width, v.height, v.frames, v.pixFmt]).toEqual([1080, 1920, 150, 'yuv420p']);
    expect(v.durationS).toBeCloseTo(5, 1);
    // The horizontal ruler: a bright 100 px line across the frame (y 1000) over the dark card; between two ticks it is dark.
    expect(luma(region(r.png, 300, 1000, 300, 2))).toBeGreaterThan(150);
    expect(luma(region(r.png, 300, 1004, 300, 4))).toBeLessThan(60);
    // The vertical ruler at the right edge: a line every 10 px of x, brighter every 50 px from the right edge (x 1030 = 50), runs down the frame.
    expect(luma(region(r.png, 1030, 600, 1, 300))).toBeGreaterThan(100);
    expect(luma(region(r.png, 1033, 600, 4, 300))).toBeLessThan(60);
    console.log(`kalibrasyon kartı: still ${r.stillMs} ms, video ${r.videoMs} ms`);
  }, 300_000);
});
