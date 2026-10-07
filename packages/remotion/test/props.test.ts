import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGlb } from '@videogen/scene3d';
import { describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type CaptionPage, type SceneSpec, type Storyboard } from '@videogen/shared';
import { bundleHash, DRAFT_RENDER } from '../src/hash.ts';
import { layoutFrames, layoutIssues, layoutManifest } from '../src/layout.ts';
import { activeBeat, activeCaption, draftLayout, draftProps, finalProps, MAX_LABELS, overlayBoxes, placeLabels, safeRect, type LabelBox, type Rect } from '../src/props.ts';

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

  const page = (a: number, b: number, ...ws: string[]): CaptionPage => ({ start_ms: a, end_ms: b, words: ws.map((text, i) => ({ text, start_ms: a + i * 300, end_ms: a + i * 300 + 280 })) });
  const captions = [page(0, 2500, 'Bu', 'bir', 'kalem'), page(4000, 6000, 'Bilye', 'dönerken', 'mürekkebi')];
  const finalOf = (c?: CaptionPage[]) => finalProps({
    glbUrl: '/g', framesUrl: 'http://x/f', yfov: track.yfov, scene: fx<SceneSpec>('scene-kalem'), storyboard: fx<Storyboard>('storyboard-kalem'), style: CHANNEL_STYLES.gece_mavisi, ...(c ? { captions: c } : {}),
  });

  it('VO captions: finalProps carries the caption pages; the overlay boxes put the caption band at the bottom and the beat text at the top from beat 1; draft props never have captions', () => {
    const p = finalOf(captions);
    expect(p.captions).toEqual(captions);
    expect('captions' in finalOf()).toBe(false); // silent finals stay byte-identical
    expect('captions' in draftProps({ glbUrl: '', yfov: track.yfov, width: 540, height: 960, scene: fx<SceneSpec>('scene-kalem'), storyboard: fx<Storyboard>('storyboard-kalem'), style: CHANNEL_STYLES.gece_mavisi })).toBe(false);
    const L = draftLayout(1080, 1920);
    const mid = L.safe.top + (L.safe.bottom - L.safe.top) / 2;
    // Beat 0: hook at the top, the caption page at the bottom.
    const f0 = overlayBoxes(p, 0, []);
    expect(f0.map((b) => b.kind)).toEqual(['hook', 'caption']);
    expect(f0[0]!.box[1]).toBeLessThan(mid);
    expect(f0[1]!.box[1]).toBeGreaterThan(mid);
    expect(f0[1]!.box[3]).toBeLessThanOrEqual(L.safe.bottom);
    // Beat 1 (3–9 s): the beat text moves to the top band, the caption stays at the bottom; between pages there is no caption box.
    const f1 = overlayBoxes(p, 125, []);
    expect(f1.map((b) => b.kind)).toEqual(['beat', 'caption']);
    expect(f1[0]!.box[1]).toBeLessThan(mid);
    expect(f1[1]!.box[1]).toBeGreaterThan(mid);
    expect(overlayBoxes(p, 100, []).map((b) => b.kind)).toEqual(['beat']);
    // Without captions the silent layout is unchanged: the beat line sits at the bottom.
    const silent = overlayBoxes(finalOf(), 125, []);
    expect(silent.map((b) => b.kind)).toEqual(['beat']);
    expect(silent[0]!.box[1]).toBeGreaterThan(mid);
  });

  it('layout.json lists caption boxes; a caption page outside the safe area is a G6 layout issue (kind caption); two 52 px lines fit the band', async () => {
    const p = finalOf(captions);
    expect(layoutFrames(p)).toContain(120); // the second page starts at 4 s
    // A page start off the 5-frame grid (4100 ms = frame 123) is sampled, and its box is listed.
    const off = finalOf([page(4100, 6000, 'Bilye', 'döner')]);
    expect(layoutFrames(off)).toContain(123);
    expect(layoutFrames(finalOf([page(4010, 6000, 'a')]))).toContain(121); // ceil: the first frame the page is visible
    expect(layoutFrames(finalOf())).toEqual(layoutFrames({ frames: p.frames, beats: p.beats }));
    const gltf = await parseGlb(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/scene/kalem/scene.glb')));
    const m = layoutManifest(p, gltf);
    const at = (f: number) => m.frames.find((x) => x.frame === f)!.boxes.filter((b) => b.kind === 'caption');
    expect(at(0)).toHaveLength(1);
    expect(at(120)).toHaveLength(1);
    expect(at(195)).toHaveLength(0); // 6.5 s: between pages
    expect(layoutIssues(m)).toEqual([]);
    expect(m.captions).toBe(true);
    // A 60-char beat (3 lines) in the top band of a VO final runs into the label area: a beat issue; silent finals are unchanged.
    const wideBeat = { ...p, beats: p.beats.map((b, i) => (i === 1 ? { ...b, text: 'Mürekkep bilyenin etrafında dönerken kağıda yazı bırakır ok' } : b)) };
    const wm = layoutManifest(wideBeat, gltf);
    expect(layoutIssues(wm).map((i) => i.kind)).toContain('beat');
    expect(layoutIssues(wm).every((i) => i.kind === 'beat')).toBe(true);
    const silentWide = layoutManifest({ ...wideBeat, captions: undefined }, gltf);
    expect(silentWide.captions).toBeUndefined();
    expect('captions' in silentWide).toBe(false);
    expect(layoutIssues(silentWide)).toEqual([]);
    expect(layoutManifest({ ...wideBeat, captions: [] }, gltf).captions).toBeUndefined();
    // activeCaption: the end is exclusive (adjacent pages never overlap), the active word follows the clock.
    const adj = [page(0, 1000, 'a', 'b', 'c'), page(1000, 2000, 'd')];
    expect(activeCaption(adj, 999)!.page).toBe(adj[0]);
    expect(activeCaption(adj, 1000)!.page).toBe(adj[1]);
    expect(activeCaption(adj, 2000)).toBeNull();
    expect([0, 300, 650].map((ms) => activeCaption(adj, ms)!.word)).toEqual([0, 1, 2]);
    // captions: [] is silent: the beat line stays at the bottom.
    expect(overlayBoxes(finalOf([]), 125, [])[0]!.box[1]).toBeGreaterThan(draftLayout(1080, 1920).safe.top + 340);
    // The longest page (28 chars) wraps to two 52 px lines inside the band.
    const long = page(0, 3000, 'Mürekkep', 'taşıyıcılar', 'dönüyor');
    const box = overlayBoxes({ ...p, captions: [long] }, 0, []).find((b) => b.kind === 'caption')!.box;
    const L = draftLayout(1080, 1920);
    expect(box[3] - box[1]).toBeLessThanOrEqual(2 * 52 * 1.25 + 12);
    expect(box[3] - box[1]).toBeGreaterThan(52 * 1.25 + 12);
    expect(box[1]).toBeGreaterThanOrEqual(L.safe.top);
    expect(box[3]).toBeLessThanOrEqual(L.safe.bottom);
    // A caption box below the safe area is reported with its kind.
    const bad = { width: 1080, height: 1920, fps: 30, frames: [{ frame: 0, boxes: [{ kind: 'caption' as const, box: [24, 1480, 900, 1560] as [number, number, number, number] }] }] };
    expect(layoutIssues(bad)).toEqual([{ frame: 0, kind: 'caption', box: [24, 1480, 900, 1560] }]);
  });
});
