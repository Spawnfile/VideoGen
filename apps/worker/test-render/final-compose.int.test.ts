import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { finalProps, overlayBoxes } from '@videogen/remotion/props';
import { BlenderRenderDriver } from '../src/render/driver.ts';
import { probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const DATA = mkdtempSync(join(tmpdir(), 'vg-final-compose-int-'));
afterAll(() => { if (!process.env.VG_KEEP) rmSync(DATA, { recursive: true, force: true }); });
const json = <T>(p: string) => JSON.parse(readFileSync(join(FX, p), 'utf8')) as T;
const style = CHANNEL_STYLES.gece_mavisi;
const { glbUrl: _g, framesUrl: _f, ...props } = finalProps({
  glbUrl: '', framesUrl: '', yfov: json<{ yfov: number[] }>('scene/kalem/camera_track.json').yfov,
  scene: json<SceneSpec>('artifacts/scene-kalem.json'), storyboard: json<Storyboard>('artifacts/storyboard-kalem.json'), style,
});
/** Mean RGB of a w×h region of frame n. */
const region = (file: string, n: number, x: number, y: number, w: number, h: number) =>
  [...execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n}),crop=${w}:${h}:${x}:${y},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

describe('Final3D (real system Chrome)', () => {
  const frames = join(DATA, 'frames');
  const out = join(DATA, 'master.mp4');
  it('draws each Blender frame over the style backdrop: 1080×1920, the frame\'s pixels, the backdrop where the frame is transparent', async () => {
    mkdirSync(frames, { recursive: true });
    // 30 transparent RGBA frames with an opaque red square in the middle (a stand-in for Blender's output).
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920:r=30,format=rgba,drawbox=x=440:y=860:w=200:h=200:color=red@1:t=fill:replace=1', '-frames:v', '30', '-start_number', '0', join(frames, 'f%05d.png')]);
    const d = new BlenderRenderDriver({ blender: '/nonexistent', bwrap: '/nonexistent', dataDir: DATA, home: DATA });
    const r = await d.compose({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), framesDir: frames, outPath: out, owner: 'int', frameRange: [0, 29] });
    expect(r.frames).toBe(30);
    const p = await probeVideo(FFMPEG, out);
    expect([p.width, p.height, p.frames, p.pixFmt, p.colorSpace]).toEqual([1080, 1920, 30, 'yuv420p', 'bt709']);
    const red = region(out, 10, 500, 920, 80, 80);
    expect(red[0]!).toBeGreaterThan(200);
    expect(red[1]! + red[2]!).toBeLessThan(80);
    region(out, 10, 2, 2, 4, 4).forEach((c, i) => expect(Math.abs(c - hex(style.background.top)[i]!)).toBeLessThanOrEqual(8));
    console.log(`final compose: 30 kare ${r.ms} ms`);
  }, 300_000);

  it('draws the hook plate where layout.json says it is (frame 0)', () => {
    const hook = overlayBoxes(props, 0, []).find((b) => b.kind === 'hook')!.box;
    const [x0, y0, x1, y1] = hook;
    const inside = region(out, 0, x0 + 8, y0 + 8, Math.min(200, x1 - x0 - 16), Math.max(8, y1 - y0 - 16));
    const back = hex(style.background.top);
    expect(inside.reduce((a, c, i) => a + Math.abs(c - back[i]!), 0)).toBeGreaterThan(24);
  });
});
