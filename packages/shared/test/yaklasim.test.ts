import { describe, expect, it } from 'vitest';
import {
  effectiveDuration, plainText, publishErrors, splitAccent, StoryboardSchema, SceneSpecSchema, wordCount, yaklasimSafeArea, yaklasimSceneErrors,
  yaklasimStoryboardErrors, type SceneSpec, type Storyboard,
} from '../src/index.ts';

const HOOK = "Why doesn't it *FALL APART*?";
const beat = (id: string, t0: number, t1: number, role: string, text: string, extra: Record<string, unknown> = {}) => ({
  id, t_start: t0, t_end: t1, role, transition: 'cut',
  camera: { shot: role === 'macro' ? 'macro' : 'hero', move: 'push_in', lens_mm: 85 },
  parts: ['govde'], action: 'parts burst outward', onscreen_text: { tr: text }, sfx_cues: [], claim_ids: ['c1'], ...extra,
});
function good(): Storyboard {
  return StoryboardSchema.parse({
    version: 1, audio_mode: 'silent', duration_s: 13,
    hook: { pattern: 'question', text_tr: HOOK },
    beats: [
      beat('b0', 0, 1.5, 'hook', HOOK),
      beat('b1', 1.5, 3.5, 'xray', 'A hidden *skeleton*.'),
      beat('b2', 3.5, 5.5, 'macro', 'Every piece has a *foot*.'),
      beat('b3', 5.5, 8, 'assembly', 'They *lock* each other.', { transition: 'flash' }),
      beat('b4', 8, 10.5, 'counter', '*43 quintillion* combos.', { counter: { value: '43252003274489856000', label: 'combos' } }),
      beat('b5', 10.5, 13, 'twist', HOOK, { transition: 'flash' }),
    ],
    rehook_at: 6.5, payoff_at: 10.5, loop_strategy: 'reassemble and snap back into the burst',
    publish: {
      caption: "How a Rubik's cube holds itself together. No glue, no magnets — a hidden core and six springs.\nHave you ever taken one apart?\nSend this to someone who never solved one.\n#rubikscube #howitworks #satisfying",
      youtube_title: "How a Rubik's cube holds itself together",
    },
  });
}
const mutate = (f: (s: Storyboard) => void): Storyboard => { const s = structuredClone(good()); f(s); return s; };
const errs = (s: Storyboard) => yaklasimStoryboardErrors(s).join(' | ');

describe('YAKLASIM storyboard rules (spec Y3, Y5, Y6, Y17)', () => {
  it('a storyboard that follows the approach has no errors', () => {
    expect(yaklasimStoryboardErrors(good())).toEqual([]);
  });

  it('names each broken rule', () => {
    expect(errs(mutate((s) => { s.duration_s = 16; s.beats.at(-1)!.t_end = 16; }))).toMatch(/12–15 s/);
    expect(errs(mutate((s) => { s.beats[0]!.t_end = 1.25; s.beats[1]!.t_start = 1.25; }))).toMatch(/0\.5 s grid/);
    expect(errs(mutate((s) => { s.beats[1]!.t_end = 4.5; s.beats[2]!.t_start = 4.5; }))).toMatch(/at most 2\.5 s/);
    expect(errs(mutate((s) => { s.beats.splice(1, 1); s.beats[0]!.t_end = 3.5; }))).toMatch(/at least 6 beats/);
    expect(errs(mutate((s) => { s.beats[0]!.role = 'xray'; }))).toMatch(/starts with the hook/);
    expect(errs(mutate((s) => { s.beats.at(-1)!.role = 'counter'; }))).toMatch(/ends with the twist/);
    expect(errs(mutate((s) => { s.beats[4]!.role = 'assembly'; delete s.beats[4]!.counter; }))).toMatch(/needs a counter beat/);
    expect(errs(mutate((s) => { s.beats[1]!.role = 'macro'; s.beats[2]!.role = 'xray'; }))).toMatch(/order/);
    expect(errs(mutate((s) => { delete s.beats[4]!.counter; }))).toMatch(/counter value/);
    expect(errs(mutate((s) => { s.beats[2]!.camera.move = 'static'; }))).toMatch(/static/);
    expect(errs(mutate((s) => { s.beats[1]!.onscreen_text.tr = 'This is a hidden plastic skeleton'; }))).toMatch(/5 words/);
    expect(errs(mutate((s) => { s.beats[1]!.onscreen_text.tr = 'Gövde içinde'; }))).toMatch(/English/);
    expect(errs(mutate((s) => { s.beats[1]!.onscreen_text.tr = '*A* hidden *skeleton*'; }))).toMatch(/one accent/);
    expect(errs(mutate((s) => { s.beats.at(-1)!.onscreen_text.tr = 'Or just do *this*'; }))).toMatch(/loop/);
    expect(errs(mutate((s) => { delete s.publish; }))).toMatch(/publish/);
    expect(errs(mutate((s) => { s.audio_mode = 'vo'; }))).toMatch(/voiceover/);
  });

  it('accent and word helpers', () => {
    expect(splitAccent(HOOK)).toEqual({ before: "Why doesn't it ", accent: 'FALL APART', after: '?' });
    expect(splitAccent('No accent')).toEqual({ before: 'No accent', accent: null, after: '' });
    expect(splitAccent('*a* and *b*')).toBeNull();
    expect(splitAccent('*unbalanced')).toBeNull();
    expect(plainText(HOOK)).toBe("Why doesn't it FALL APART?");
    expect(wordCount(HOOK)).toBe(5);
    expect(wordCount('43,252,003 combos.')).toBe(2);
  });
});

describe('YAKLASIM caption (spec Y17)', () => {
  const ok = good().publish!;
  it('accepts the good caption and names the broken rules', () => {
    expect(publishErrors(ok)).toEqual([]);
    expect(publishErrors(undefined).join()).toMatch(/publish/);
    expect(publishErrors({ ...ok, caption: ok.caption.replace('?', '.') }).join()).toMatch(/question/);
    expect(publishErrors({ ...ok, caption: `${ok.caption} #a #b #c` }).join()).toMatch(/1–5 hashtags/);
    expect(publishErrors({ ...ok, caption: ok.caption.replace(/#\S+/g, '') }).join()).toMatch(/1–5 hashtags/);
    expect(publishErrors({ ...ok, caption: `${ok.caption} çok güzel` }).join()).toMatch(/English/);
    expect(publishErrors({ ...ok, youtube_title: 't'.repeat(101) }).join()).toMatch(/100/);
    expect(publishErrors({ ...ok, youtube_title: 'Inside #cube' }).join()).toMatch(/hashtag/);
  });
});

function scene(): SceneSpec {
  const part = (id: string, vec: number[], t0: number, back: [number, number] | null) => ({
    id, name_tr: id, recipe: { primitive: 'box', note: 'n' }, material_preset: 'abs_gloss', anchor_local: [0, 0, 0],
    explode: { vector: vec, t_start: t0, t_end: t0 + 1.5, ease: 'ease_out', ...(back ? { back: { t_start: back[0], t_end: back[1], ease: 'back_out' } } : {}) },
  });
  return SceneSpecSchema.parse({
    units: 'cm', fps: 30, duration_s: 13, frames: 390, style_id: 'yaklasim', lighting_preset: 'yaklasim', hero_part: 'govde',
    parts: [part('govde', [0, 0, 3], -0.5, [11, 12.5]), part('yay', [3, 0, 0], -0.4, [11.5, 12.5]), part('uc', [0, 0, 0], 0, null)],
    camera_keys: [
      { t: 0, position: [0, -40, 5], target: [0, 0, 0], lens_mm: 85, ease: 'ease_in_out' },
      { t: 6, position: [10, -30, 8], target: [0, 0, 2], lens_mm: 100, ease: 'ease_in_out' },
      { t: 13, position: [0, -40, 5], target: [0, 0, 0], lens_mm: 85, ease: 'linear' },
    ],
  });
}
const sceneMut = (f: (s: SceneSpec) => void) => { const s = structuredClone(scene()); f(s); return yaklasimSceneErrors(s, good()).join(' | '); };

describe('YAKLASIM scene rules (spec Y12, Y13)', () => {
  it('a scene that follows the approach has no errors', () => {
    expect(yaklasimSceneErrors(scene(), good())).toEqual([]);
  });
  it('names each broken rule', () => {
    expect(sceneMut((s) => { s.style_id = 'gece_mavisi'; })).toMatch(/yaklasim style/);
    expect(sceneMut((s) => { s.lighting_preset = 'soft_box'; })).toMatch(/yaklasim light/);
    expect(sceneMut((s) => { for (const p of s.parts) p.explode.t_start = 0; })).toMatch(/mid-burst/);
    expect(sceneMut((s) => { delete s.parts[1]!.explode.back; })).toMatch(/reassemble/);
    expect(sceneMut((s) => { s.parts[0]!.explode.back = { t_start: 8, t_end: 10, ease: 'linear' }; s.parts[1]!.explode.back = { t_start: 8, t_end: 11, ease: 'linear' }; })).toMatch(/assembled at the end/);
    expect(sceneMut((s) => { s.camera_keys[1] = { ...s.camera_keys[0]!, t: 6 }; })).toMatch(/static camera/);
    // Final review I3: the loop wraps 'snap → burst', so the camera ends where it started.
    expect(sceneMut((s) => { s.camera_keys[2] = { ...s.camera_keys[2]!, position: [5, -30, 6] }; })).toMatch(/camera returns to its first key/);
    expect(sceneMut((s) => { s.camera_keys[2] = { ...s.camera_keys[2]!, lens_mm: 100 }; })).toMatch(/camera returns to its first key/);
  });
});

describe('fixed window and safe area (spec Y1, Y10)', () => {
  it('the window is 12–15 s whatever the user or the agent asks', () => {
    expect(effectiveDuration({ user: { minS: 30, maxS: 40 }, agent: { minS: 20, maxS: 30 } })).toEqual({ window: { minS: 12, maxS: 15 }, source: 'default' });
  });
  it('the YAKLASIM margins and the calibrated area merge by the stricter edge', () => {
    expect(yaklasimSafeArea({ top: 150, bottom: 1510, right: 130, left: 24 })).toEqual({ top: 250, bottom: 1500, right: 130, left: 120 });
    expect(yaklasimSafeArea({ top: 300, bottom: 1400, right: 100, left: 140 })).toEqual({ top: 300, bottom: 1400, right: 120, left: 140 });
  });
});

describe('the YAKLASIM kalem fixtures follow the approach (spec Y20)', () => {
  it('storyboard and scene pass the schema and both validators', async () => {
    const { readFileSync } = await import('node:fs');
    const fx = (n: string) => JSON.parse(readFileSync(new URL(`../../../tests/fixtures/artifacts/${n}.json`, import.meta.url), 'utf8')) as unknown;
    const sb = StoryboardSchema.parse(fx('storyboard-kalem'));
    const sc = SceneSpecSchema.parse(fx('scene-kalem'));
    expect(yaklasimStoryboardErrors(sb)).toEqual([]);
    expect(yaklasimSceneErrors(sc, sb)).toEqual([]);
  });
});

describe('YAKLASIM music score (spec Y14)', () => {
  it('a deterministic, valid 120 BPM A-minor score covering the video, with a sparse section on every macro beat and no riser', async () => {
    const { musicScoreErrors, MusicScoreSchema, yaklasimScore, sparseWindows } = await import('../src/index.ts');
    const sb = good();
    const s = yaklasimScore(sb);
    expect(MusicScoreSchema.parse(s)).toEqual(s);
    expect(musicScoreErrors(s, { durationS: sb.duration_s })).toEqual([]);
    expect(s).toMatchObject({ bpm: 120, key: { root: 'A', mode: 'minor' }, duration_s: 13, accents: [] });
    expect(s.sections.map((x) => [x.id, x.t_start, x.t_end])).toEqual([['full_1', 0, 3.5], ['macro_1', 3.5, 5.5], ['full_2', 5.5, 13]]);
    for (const x of s.sections) expect(x.chords).toEqual(['Am', 'F', 'C', 'G']);
    expect(sparseWindows(s)).toEqual([[3.5, 5.5]]);
    expect(yaklasimScore(sb)).toEqual(s);
  });
});
