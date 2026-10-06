import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkEquivalence, parseGlb, SceneClock } from '../src/index.ts';

const DIR = resolve(import.meta.dirname, '../../../tests/fixtures/scene/kalem');
const json = (f: string) => JSON.parse(readFileSync(resolve(DIR, f), 'utf8'));
const FRAMES = [0, 337, 675, 1012, 1350];
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
    anchors.frames['675'].yay[0] += 20;
    const r = checkEquivalence(await load(), anchors, json('camera_track.json'), FRAMES);
    expect(r.pass).toBe(false);
    expect(r.rows.filter((x) => x.px > 8)).toEqual([{ frame: 675, partId: 'yay', px: 20 }]);
  });

  it('reports an anchor that has no node in the GLB and a frame without reference positions', async () => {
    const anchors = json('anchors.json');
    anchors.frames['0'].kapak = [10, 10];
    const r = checkEquivalence(await load(), anchors, json('camera_track.json'), [0, 1]);
    expect(r.missing).toEqual(['frame:1', 'kapak']);
    expect(r.pass).toBe(false);
  });

  it('seek is history-free: a finished clip keeps its last pose after seeking back and forth (probe P6)', async () => {
    const gltf = await load();
    const clock = new SceneClock(gltf);
    const yay = gltf.scene.getObjectByName('yay')!;
    clock.seek(45);
    const end = yay.position.toArray();
    clock.seek(7);
    clock.seek(45);
    // Blender explode vector [-3, 0, 4] (Z-up) → glTF (x, z, −y)
    for (const [i, v] of [-3, 4, 0].entries()) expect(yay.position.toArray()[i]).toBeCloseTo(v, 4);
    expect(yay.position.toArray()).toEqual(end);
  });
});
