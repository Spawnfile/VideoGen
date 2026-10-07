import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { parseGlb } from '@videogen/scene3d';
import { layoutFrames, layoutIssues, layoutManifest } from '../src/layout.ts';
import { finalProps, frameUrl, MAX_LABELS, overlayBoxes, safeRect, wrapLines } from '../src/props.ts';

const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const json = <T>(p: string) => JSON.parse(readFileSync(resolve(FX, p), 'utf8')) as T;
const props = () => finalProps({
  glbUrl: '/g', framesUrl: 'http://127.0.0.1:1/tok/frames', yfov: json<{ yfov: number[] }>('scene/kalem/camera_track.json').yfov,
  scene: json<SceneSpec>('artifacts/scene-kalem.json'), storyboard: json<Storyboard>('artifacts/storyboard-kalem.json'), style: CHANNEL_STYLES.gece_mavisi,
});
const inside = (b: [number, number, number, number], r = safeRect(1080, 1920)) => b[0] >= r.left && b[1] >= r.top && b[2] <= r.right && b[3] <= r.bottom;

describe('Final3D props, overlay boxes and layout.json (plan E7, E9)', () => {
  it('is the draft composition at 1080×1920 plus the frame sequence URL', () => {
    const p = props();
    expect(p).toMatchObject({ width: 1080, height: 1920, frames: 1350, framesUrl: 'http://127.0.0.1:1/tok/frames', hook: "0,7 mm'lik bir bilye her şeyi yazıyor" });
    expect(frameUrl(p.framesUrl, 12)).toBe('http://127.0.0.1:1/tok/frames/f00012.png');
  });

  it('places the hook at the top and the beat line at the bottom of the safe area, wrapping long text', () => {
    const p = props();
    const hook = overlayBoxes(p, 0, []);
    expect(hook.map((b) => b.kind)).toEqual(['hook']);
    expect(inside(hook[0]!.box)).toBe(true);
    const beat = overlayBoxes(p, 120, []);
    expect(beat.map((b) => b.kind)).toEqual(['beat']);
    expect(beat[0]!.box[3]).toBeLessThanOrEqual(safeRect(1080, 1920).bottom);
    expect(wrapLines('Bilye dönerken mürekkebi taşır ve kağıda bırakır, her yazışta binlerce kez', 52, 880)).toEqual(['Bilye dönerken mürekkebi', 'taşır ve kağıda bırakır,', 'her yazışta binlerce kez']);
    const long = overlayBoxes({ ...p, hook: 'Ç'.repeat(60) }, 0, []);
    expect(inside(long[0]!.box)).toBe(true);
    // An unbreakable word is cut into line-sized pieces (Overlay: overflow-wrap anywhere), not clamped to one line.
    expect(wrapLines('Ç'.repeat(60), 68, 852)).toEqual(['Ç'.repeat(18), 'Ç'.repeat(18), 'Ç'.repeat(18), 'Ç'.repeat(6)]);
    expect(long[0]!.box[3] - long[0]!.box[1]).toBeGreaterThan(3 * 68);
  });

  it('layout.json of the pen: sampled every 5 frames and at every beat start, labels ≤ 6, every box inside the safe area', async () => {
    const p = props();
    const gltf = await parseGlb(readFileSync(resolve(FX, 'scene/kalem/scene.glb')));
    const frames = layoutFrames(p);
    expect(frames.slice(0, 3)).toEqual([0, 5, 6]);
    for (const b of json<Storyboard>('artifacts/storyboard-kalem.json').beats) expect(frames).toContain(Math.round(b.t_start * 30));
    const m = layoutManifest(p, gltf);
    expect(m.frames.length).toBe(frames.length);
    expect(Math.max(...m.frames.map((f) => f.boxes.filter((b) => b.kind === 'label').length))).toBeLessThanOrEqual(MAX_LABELS);
    expect(m.frames.some((f) => f.boxes.some((b) => b.kind === 'label'))).toBe(true);
    expect(layoutIssues(m)).toEqual([]);
  });

  it('layoutIssues names the frame, kind and box of text outside the safe area', () => {
    const m = { width: 1080, height: 1920, fps: 30, frames: [{ frame: 90, boxes: [{ kind: 'beat' as const, box: [24, 1480, 900, 1560] as [number, number, number, number] }, { kind: 'label' as const, id: 'yay', box: [100, 600, 400, 650] as [number, number, number, number] }] }] };
    expect(layoutIssues(m)).toEqual([{ frame: 90, kind: 'beat', box: [24, 1480, 900, 1560] }]);
  });
});
