import { describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { draftProps, finalProps } from '../src/props.ts';
import { counterText, flashAt, textScale, yaklasimBoxes, yaklasimLayout } from '../src/yaklasim.ts';
import { layoutIssues } from '../src/layout.ts';

const HOOK = "Why doesn't it *FALL APART*?";
const beat = (t_start: number, t_end: number, role: string, text: string, extra: Record<string, unknown> = {}) =>
  ({ id: `b${t_start}`, t_start, t_end, role, transition: 'cut', camera: { shot: 'hero', move: 'push_in', lens_mm: 85 }, parts: ['govde'], action: 'a', onscreen_text: { tr: text }, sfx_cues: [], claim_ids: [], ...extra });
const storyboard = {
  version: 1, audio_mode: 'silent', duration_s: 13, hook: { pattern: 'question', text_tr: HOOK }, rehook_at: 6.5, payoff_at: 10.5, loop_strategy: 'l',
  beats: [beat(0, 1.5, 'hook', HOOK), beat(1.5, 3.5, 'xray', 'A hidden *skeleton*.'), beat(3.5, 5.5, 'macro', 'Every piece has a *foot*.'),
    beat(5.5, 8, 'assembly', 'They *lock* in.', { transition: 'flash' }), beat(8, 10.5, 'counter', 'combos', { counter: { value: '43252003274489856000', label: 'combos' } }), beat(10.5, 13, 'twist', HOOK, { transition: 'flash' })],
} as unknown as Storyboard;
const scene = (style_id: string) => ({ frames: 390, style_id, parts: [{ id: 'govde', name_tr: 'Gövde' }] }) as unknown as SceneSpec;
const props = (style: 'yaklasim' | 'gece_mavisi', safeArea = { top: 150, bottom: 1510, right: 130, left: 24 }) =>
  finalProps({ glbUrl: 'g', yfov: [], scene: scene(style), storyboard, style: CHANNEL_STYLES[style], framesUrl: 'f', safeArea });

describe('YAKLASIM look in Remotion (spec Y8–Y11)', () => {
  it('a yaklasim scene gets the yaklasim look and the merged safe area; an older style keeps the legacy look and its area', () => {
    const y = props('yaklasim');
    expect(y).toMatchObject({ look: 'yaklasim', safeArea: { top: 250, bottom: 1500, right: 130, left: 120 } });
    expect(y.beats[4]).toMatchObject({ role: 'counter', counter: { value: '43252003274489856000', label: 'combos' } });
    expect(y.beats[3]).toMatchObject({ transition: 'flash' });
    const old = props('gece_mavisi');
    expect(old).toMatchObject({ look: 'legacy', safeArea: { top: 150, bottom: 1510, right: 130, left: 24 } });
    const d = draftProps({ glbUrl: 'g', yfov: [], width: 540, height: 960, scene: scene('yaklasim'), storyboard, style: CHANNEL_STYLES.yaklasim });
    expect(d.look).toBe('yaklasim');
  });

  it('flash: white for 4 frames from a flash beat, shake decays within 10 frames, nothing on plain cuts', () => {
    const p = props('yaklasim');
    const f0 = 5.5 * 30;
    expect(flashAt(p.beats, f0).white).toBeGreaterThan(0.5);
    expect(flashAt(p.beats, f0 + 4).white).toBe(0);
    expect(Math.hypot(flashAt(p.beats, f0 + 1).dx, flashAt(p.beats, f0 + 1).dy)).toBeGreaterThan(1);
    expect(Math.hypot(flashAt(p.beats, f0 + 10).dx, flashAt(p.beats, f0 + 10).dy)).toBe(0);
    expect(flashAt(p.beats, 1.5 * 30)).toEqual({ white: 0, dx: 0, dy: 0, zoom: 1 });
    expect(flashAt(p.beats, 0)).toEqual({ white: 0, dx: 0, dy: 0, zoom: 1 }); // frame 0 is the cover: no flash on it
  });

  it('counter climbs fast and ends on the exact verified number; text pops in from 94 %', () => {
    expect(counterText('43252003274489856000', 1)).toBe('43,252,003,274,489,856,000');
    expect(counterText('43252003274489856000', 0)).toBe('0');
    expect(counterText('43252003274489856000', 0.02).length).toBeLessThan('43,252,003,274,489,856,000'.length);
    expect(counterText('1200', 2)).toBe('1,200');
    expect(textScale(0)).toBeCloseTo(0.94);
    expect(textScale(2)).toBeCloseTo(0.97);
    expect(textScale(4)).toBe(1);
    expect(textScale(40)).toBe(1);
  });

  it('text sits centred in the top band inside the merged safe area, at full size on frame 0; the last beat shows the hook', () => {
    const p = props('yaklasim');
    const L = yaklasimLayout(1080, 1920, p.safeArea!);
    expect(L.textTop).toBeGreaterThanOrEqual(250);
    expect(L.textTop).toBeLessThan(1920 / 3);
    const at = (frame: number) => yaklasimBoxes(p, frame);
    for (const frame of [0, 60, 130, 200, 280, 380]) {
      for (const b of at(frame)) {
        expect(b.box[0], `frame ${frame}`).toBeGreaterThanOrEqual(120);
        expect(b.box[2], `frame ${frame}`).toBeLessThanOrEqual(1080 - 130);
        expect(b.box[1], `frame ${frame}`).toBeGreaterThanOrEqual(250);
        expect(b.box[3], `frame ${frame}`).toBeLessThanOrEqual(1500);
      }
    }
    expect(at(0).map((b) => b.kind)).toEqual(['hook']);
    expect(at(380).map((b) => b.kind)).toEqual(['hook']);
    expect(at(9 * 30).map((b) => b.kind)).toEqual(['counter', 'beat']);
    expect(layoutIssues({ width: 1080, height: 1920, fps: 30, safeArea: p.safeArea, frames: [0, 130, 270].map((frame) => ({ frame, boxes: at(frame) })) })).toEqual([]);
  });
});
