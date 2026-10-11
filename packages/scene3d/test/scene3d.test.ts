import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkEquivalence, parseGlb, SceneClock } from '../src/index.ts';

const DIR = resolve(import.meta.dirname, '../../../tests/fixtures/scene/kalem');
const json = (f: string) => JSON.parse(readFileSync(resolve(DIR, f), 'utf8'));
const FRAMES = [0, 97, 195, 292, 390]; // the 13 s YAKLASIM pen (EQUIVALENCE_FRAMES of 390)
const load = () => parseGlb(readFileSync(resolve(DIR, 'scene.glb')));

describe('scene3d', () => {
  it('Blender and three.js agree on every anchor of the five equivalence frames (spec §7.3)', async () => {
    const r = checkEquivalence(await load(), json('anchors.json'), json('camera_track.json'), FRAMES);
    expect(r.missing).toEqual([]);
    expect(r.rows).toHaveLength(25);
    expect(r.worstPx).toBeLessThan(0.1);
    expect(r.pass).toBe(true);
  });

  it('a 20 px drift on one anchor fails the check and names the part and frame', async () => {
    const anchors = json('anchors.json');
    anchors.frames['195'].yay[0] += 20;
    const r = checkEquivalence(await load(), anchors, json('camera_track.json'), FRAMES);
    expect(r.pass).toBe(false);
    expect(r.rows.filter((x) => x.px > 8)).toEqual([{ frame: 195, partId: 'yay', px: 20 }]);
  });

  it('reports an anchor that has no node in the GLB and a frame without reference positions', async () => {
    const anchors = json('anchors.json');
    anchors.frames['0'].kapak = [10, 10];
    const r = checkEquivalence(await load(), anchors, json('camera_track.json'), [0, 1]);
    expect(r.missing).toEqual(['frame:1', 'kapak']);
    expect(r.pass).toBe(false);
  });

  it('seek is history-free: the burst, the snap back home and the burst again play the same whichever way we seek (probe P6, YAKLASIM back)', async () => {
    const gltf = await load();
    const clock = new SceneClock(gltf);
    const yay = gltf.scene.getObjectByName('yay')!;
    clock.seek(5);
    const out = yay.position.toArray();
    // Blender explode vector [-3, 0, 4] (Z-up) → glTF (x, z, −y): fully out between the burst and the snap at 12–12.5 s
    for (const [i, v] of [-3, 4, 0].entries()) expect(out[i]).toBeCloseTo(v, 4);
    clock.seek(13);
    for (const v of yay.position.toArray()) expect(v).toBeCloseTo(0, 4); // home again at the loop point
    clock.seek(5);
    expect(yay.position.toArray()).toEqual(out);
  });
});
