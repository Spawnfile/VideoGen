import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { bundleHash } from '@videogen/remotion/hash';
import { draftProps } from '@videogen/remotion/props';
import { BlenderRenderDriver, RenderError, REMOTION_CLI } from '../src/render/driver.ts';
import { draftProbeErrors, probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const DATA = mkdtempSync(join(tmpdir(), 'vg-draft-int-'));
afterAll(() => rmSync(DATA, { recursive: true, force: true }));
const json = <T>(p: string) => JSON.parse(readFileSync(join(FX, p), 'utf8')) as T;
const style = CHANNEL_STYLES.gece_mavisi;
const { glbUrl: _u, ...props } = draftProps({
  glbUrl: '', yfov: json<{ yfov: number[] }>('scene/kalem/camera_track.json').yfov, width: 540, height: 960,
  scene: json<SceneSpec>('artifacts/scene-kalem.json'), storyboard: json<Storyboard>('artifacts/storyboard-kalem.json'), style,
});
const driver = () => new BlenderRenderDriver({ blender: '/nonexistent', bwrap: '/nonexistent', dataDir: DATA, home: DATA });
/** pids whose command line mentions `needle`. */
const processesMentioning = (needle: string) => readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number).filter((pid) => {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(needle); } catch { return false; }
});
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

describe('Remotion draft (real system Chrome, ANGLE)', () => {
  it('renders frames 0–59 of the pen draft: h264 yuv420p tv bt709 540×960, the style backdrop behind the canvas, a cached bundle', async () => {
    const out = join(DATA, 'r0', 'draft.mp4');
    const stages: string[] = [];
    const r = await driver().draft({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), outPath: out, owner: 'int', frameRange: [0, 59], onStage: (s) => stages.push(s) });
    expect(r.frames).toBe(60);
    expect(stages).toEqual(['bundle', 'browser', 'frames']);
    expect(draftProbeErrors(await probeVideo(FFMPEG, out), { width: 540, height: 960, frames: 60 })).toEqual([]);
    // Top-left corner (outside the safe area, no text): the gradient's top colour, within codec tolerance (grilling C29: sRGB output).
    const px = [...execFileSync(FFMPEG, ['-v', 'error', '-i', out, '-vf', 'select=eq(n\\,0),crop=4:4:2:2,scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
    hex(style.background.top).forEach((c, i) => expect(Math.abs(px[i]! - c)).toBeLessThanOrEqual(8));
    const bundle = join(DATA, 'cache', 'remotion', bundleHash());
    expect(existsSync(join(bundle, 'index.html'))).toBe(true);
    const at = statSync(bundle).mtimeMs;
    await driver().draft({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), outPath: join(DATA, 'r1', 'draft.mp4'), owner: 'int', frameRange: [0, 5] });
    expect(statSync(bundle).mtimeMs).toBe(at); // reused, not rebuilt
    console.log(`draft render: 60 kare ${r.ms} ms (concurrency ${r.concurrency})`);
  });

  it('a cancelled draft render kills Chrome with its process group and leaves no pid file', async () => {
    const ac = new AbortController();
    const p = driver().draft({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), outPath: join(DATA, 'cancel', 'draft.mp4'), owner: 'int', signal: ac.signal, onStage: (s) => { if (s === 'frames') setTimeout(() => ac.abort(), 1500); } });
    await expect(p).rejects.toSatisfy((e: unknown) => e instanceof RenderError && e.kind === 'aborted');
    await new Promise((r) => setTimeout(r, 6000)); // SIGTERM → 5 s → SIGKILL
    expect(processesMentioning(REMOTION_CLI)).toEqual([]);
    expect(processesMentioning(join(DATA, 'cancel'))).toEqual([]);
    expect(readdirSync(join(DATA, 'pids'))).toEqual([]);
  }, 300_000);
});
