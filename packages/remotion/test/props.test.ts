import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { bundleHash, DRAFT_RENDER } from '../src/hash.ts';
import { activeBeat, draftLayout, draftProps, MAX_LABELS, placeLabels, safeRect, type LabelBox, type Rect } from '../src/props.ts';

const fx = <T>(n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8')) as T;
const track = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/scene/kalem/camera_track.json'), 'utf8')) as { yfov: number[] };

const inside = (b: LabelBox, r: Rect) => b.x >= r.left && b.x + b.w <= r.right && b.y >= r.top && b.y + b.h <= r.bottom;
const overlap = (a: LabelBox, b: LabelBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('Draft3D props and layout', () => {
  it('maps the pen scene, storyboard and channel style to serialisable composition props', () => {
    const p = draftProps({ glbUrl: '/api/blobs/x', yfov: track.yfov, width: 540, height: 960, scene: fx<SceneSpec>('scene-kalem'), storyboard: fx<Storyboard>('storyboard-kalem'), style: CHANNEL_STYLES.gece_mavisi });
    expect(p).toMatchObject({ frames: 1350, width: 540, height: 960, lighting: 'key_rim_cool', hook: "0,7 mm'lik bir bilye her şeyi yazıyor", background: CHANNEL_STYLES.gece_mavisi.background });
    expect(p.yfov).toHaveLength(1351);
    expect(p.beats).toHaveLength(7);
    expect(p.beats[1]).toEqual({ t_start: 3, t_end: 9, text: 'Tam 5 parça', parts: ['govde', 'murekkep-haznesi', 'yay', 'uc-yuvasi'] });
    expect(p.labels).toMatchObject({ govde: 'Gövde', bilye: 'Bilye' });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(activeBeat(p.beats, 0)!.index).toBe(0);
    expect(activeBeat(p.beats, 3)!.index).toBe(1);
    expect(activeBeat(p.beats, 45)!.index).toBe(6); // the last frame keeps the last beat
  });

  it('keeps every label inside the safe area and the label band, without overlaps, at most six, none for anchors behind the camera', () => {
    expect(safeRect(540, 960)).toEqual({ left: 12, top: 75, right: 475, bottom: 755 });
    const L = draftLayout(540, 960);
    expect(L.labelArea.top).toBeGreaterThan(L.hookTop);
    expect(L.labelArea.bottom).toBeLessThan(L.safe.bottom);
    // Crowded, off-screen and edge anchors: right edge, below the frame, above it, all at one height.
    const at: ([number, number] | null)[] = [[530, 20], [520, 950], [5, 500], [270, 500], [270, 500], [270, 501], [100, 900], null];
    const boxes = placeLabels(at.map((a, i) => ({ id: `p${i}`, text: i === 2 ? 'Çok uzun bir parça adı örneği' : `Parça ${i}`, at: a })), 540, 960, L.labelArea);
    expect(boxes).toHaveLength(MAX_LABELS);
    expect(boxes.map((b) => b.id)).not.toContain('p7');
    for (const b of boxes) expect(inside(b, L.labelArea), JSON.stringify(b)).toBe(true);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
    // Room on the right: the label sits right of its anchor; none: it flips left.
    expect(placeLabels([{ id: 'a', text: 'Yay', at: [100, 400] }], 540, 960)[0]!.x).toBeGreaterThan(100);
    const flipped = placeLabels([{ id: 'b', text: 'Mürekkep haznesi', at: [460, 400] }], 540, 960)[0]!;
    expect(flipped.x + flipped.w).toBeLessThan(460);
  });

  it('labels only parts whose anchor is inside the frame (a line to an off-frame part is a wrong label, first real draft)', () => {
    const boxes = placeLabels([
      { id: 'left', text: 'Uç yuvası', at: [-30, 700] }, { id: 'below', text: 'Bilye', at: [200, 1010] }, { id: 'above', text: 'Yay', at: [300, -5] },
      { id: 'right', text: 'Gövde', at: [560, 400] }, { id: 'in', text: 'Hazne', at: [300, 400] },
    ], 540, 960);
    expect(boxes.map((b) => b.id)).toEqual(['in']);
  });

  it('names the bundle by a stable template hash and pins the draft render parameters', () => {
    expect(bundleHash()).toMatch(/^[0-9a-f]{16}$/);
    expect(bundleHash()).toBe(bundleHash());
    expect(DRAFT_RENDER).toMatchObject({ width: 540, height: 960, fps: 30, pixelFormat: 'yuv420p', colorSpace: 'bt709' });
  });
});
