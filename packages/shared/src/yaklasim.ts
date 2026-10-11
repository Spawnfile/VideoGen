import type { Storyboard } from './artifacts.ts';
import type { MusicScore } from './music.ts';
import type { SafeArea } from './safe-area.ts';
import type { SceneSpec } from './scene.ts';

/**
 * YAKLASIM (docs/approach/YAKLASIM.md; spec 2026-10-11-yaklasim-approach-design.md): the one production approach. The constants and the
 * deterministic rules the storyboard, build and fixer steps enforce before any reviewer sees the video.
 */
export const YAKLASIM = {
  window: { minS: 12, maxS: 15 },
  beatGridS: 0.5,
  beatMaxS: 2.5,
  minBeats: 6,
  maxWords: 5,
  sfxFromS: 5,
  roles: ['hook', 'xray', 'macro', 'assembly', 'counter', 'twist'] as const,
  transitions: ['cut', 'zoom', 'flash'] as const,
  palette: { inner: '#1a2546', mid: '#0d1222', outer: '#070a14', text: '#ffffff', accent: '#ffd23f', gridPx: 90 },
  margins: { top: 250, right: 120, bottom: 420, left: 120 },
  bpm: 120,
  hashtagsMax: 5,
} as const;
export const YAKLASIM_STYLE_ID = 'yaklasim';
export type BeatRole = (typeof YAKLASIM.roles)[number];
export type BeatTransition = (typeof YAKLASIM.transitions)[number];

const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
const EPS = 1e-6;
const onGrid = (t: number) => Math.abs(t / YAKLASIM.beatGridS - Math.round(t / YAKLASIM.beatGridS)) < 1e-6;

/** `Why doesn't it *FALL APART*?` → before/accent/after; null when there is more than one accent span or a stray `*`. */
export function splitAccent(text: string): { before: string; accent: string | null; after: string } | null {
  const stars = [...text].filter((c) => c === '*').length;
  if (stars === 0) return { before: text, accent: null, after: '' };
  if (stars !== 2) return null;
  const a = text.indexOf('*');
  const b = text.indexOf('*', a + 1);
  if (b === a + 1) return null;
  return { before: text.slice(0, a), accent: text.slice(a + 1, b), after: text.slice(b + 1) };
}
export const plainText = (text: string): string => text.replaceAll('*', '');
export const wordCount = (text: string): number => plainText(text).trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Spec Y3: English, at most five words, at most one accent span. */
function textErrors(where: string, text: string): string[] {
  const out: string[] = [];
  if (TURKISH.test(text)) out.push(`${where}: on-screen text must be English (no Turkish letters)`);
  if (wordCount(text) > YAKLASIM.maxWords) out.push(`${where}: at most ${YAKLASIM.maxWords} words on screen ("${plainText(text)}" has ${wordCount(text)})`);
  if (splitAccent(text) === null) out.push(`${where}: at most one accent span, written *like this*`);
  return out;
}

/** Spec Y17: caption = two sentences + one question + a share line + 1–5 hashtags, English; title ≤ 100 without hashtags. */
export function publishErrors(p: { caption: string; youtube_title: string } | undefined): string[] {
  if (!p) return ['publish: write publish.caption and publish.youtube_title'];
  const out: string[] = [];
  const tags = p.caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length < 1 || tags.length > YAKLASIM.hashtagsMax) out.push(`publish.caption: 1–5 hashtags (has ${tags.length})`);
  if (!p.caption.includes('?')) out.push('publish.caption: ask one easy question (a "?")');
  if (TURKISH.test(p.caption) || TURKISH.test(p.youtube_title)) out.push('publish: caption and title are English');
  if (p.caption.length > 2200) out.push('publish.caption: at most 2200 characters');
  if (p.youtube_title.length > 100) out.push('publish.youtube_title: at most 100 characters');
  if (p.youtube_title.includes('#')) out.push('publish.youtube_title: no hashtag in the title');
  return out;
}

/** Spec Y5/Y6: the curiosity chain on a 0.5 s grid, ≤ 2.5 s beats, English ≤ 5 words, the loop back to the hook. */
export function yaklasimStoryboardErrors(sb: Storyboard): string[] {
  const out: string[] = [];
  const W = YAKLASIM.window;
  if (sb.audio_mode !== 'silent') out.push('YAKLASIM has no voiceover: audio_mode must be silent');
  if (sb.duration_s < W.minS - EPS || sb.duration_s > W.maxS + EPS) out.push(`duration_s ${sb.duration_s}: YAKLASIM videos are 12–15 s`);
  if (sb.beats.length < YAKLASIM.minBeats) out.push(`at least 6 beats (has ${sb.beats.length}): hook, xray, macro, assembly, counter, twist`);
  sb.beats.forEach((b, i) => {
    if (!onGrid(b.t_start) || !onGrid(b.t_end)) out.push(`beat ${b.id}: cut on the 0.5 s grid (the 120 BPM beat), not at ${b.t_start}–${b.t_end} s`);
    if (b.t_end - b.t_start > YAKLASIM.beatMaxS + EPS) out.push(`beat ${b.id}: a scene lasts at most 2.5 s (${(b.t_end - b.t_start).toFixed(2)} s)`);
    if (b.camera.move === 'static') out.push(`beat ${b.id}: no static camera — the camera always flows`);
    if (!b.role) out.push(`beat ${b.id}: give it a role (${YAKLASIM.roles.join(', ')})`);
    if (b.role === 'counter' && !b.counter) out.push(`beat ${b.id}: the counter beat needs its counter value (digits) and label`);
    out.push(...textErrors(`beat ${b.id}`, b.onscreen_text.tr));
    void i;
  });
  out.push(...textErrors('hook', sb.hook.text_tr));
  const roles = sb.beats.map((b) => b.role);
  if (roles[0] !== 'hook') out.push('the video starts with the hook beat (role hook)');
  if (roles.at(-1) !== 'twist') out.push('the video ends with the twist beat (role twist), which loops back to the hook');
  for (const r of ['xray', 'macro', 'assembly', 'counter'] as const) if (!roles.includes(r)) out.push(`the chain needs a ${r} beat`);
  const rank = (r: string | undefined) => YAKLASIM.roles.indexOf(r as BeatRole);
  const ranks = roles.map(rank).filter((n) => n >= 0);
  if (ranks.some((n, i) => i > 0 && n < ranks[i - 1]!)) out.push(`beat order: ${YAKLASIM.roles.join(' → ')} (assembly may repeat)`);
  const last = sb.beats.at(-1);
  if (last && plainText(last.onscreen_text.tr) !== plainText(sb.hook.text_tr)) out.push('loop: the last beat shows the hook text again, so the video wraps around');
  out.push(...publishErrors(sb.publish));
  return out;
}

/** The same easings as python/vg_blender/vg_blender/motion.py. */
export function ease(kind: string, x: number): number {
  const t = Math.min(1, Math.max(0, x));
  switch (kind) {
    case 'linear': return t;
    case 'ease_in': return t * t * t;
    case 'ease_out': return 1 - (1 - t) ** 3;
    case 'ease_in_out': return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    case 'back_out': { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }
    default: throw new Error(`unknown ease: ${kind}`);
  }
}

/** Spec Y12/Y13: yaklasim style and lights, mid-burst at frame 0, every burst part snaps back, assembled at the end, no static camera. */
export function yaklasimSceneErrors(spec: SceneSpec, _sb: Storyboard): string[] {
  const out: string[] = [];
  if (spec.style_id !== YAKLASIM_STYLE_ID) out.push('style_id must be the yaklasim style');
  if (spec.lighting_preset !== 'yaklasim') out.push('lighting_preset must be the yaklasim light rig (warm key, blue and orange rims)');
  const moving = spec.parts.filter((p) => p.explode.vector.some((v) => Math.abs(v) > EPS));
  const atZero = moving.filter((p) => {
    const span = p.explode.t_end - p.explode.t_start;
    const k = span > 0 ? ease(p.explode.ease, (0 - p.explode.t_start) / span) : 0;
    return p.explode.t_start < 0 && k > 0.05 && k < 0.95;
  });
  if (atZero.length < 2) out.push('frame 0 is mid-burst: at least two parts already moving out at t=0 (explode.t_start below 0, small offsets)');
  const noBack = moving.filter((p) => !p.explode.back).map((p) => p.id);
  if (noBack.length) out.push(`every part that bursts out must reassemble (explode.back): ${noBack.join(', ')}`);
  const lastBack = Math.max(0, ...moving.map((p) => p.explode.back?.t_end ?? 0));
  if (moving.length && lastBack < spec.duration_s - 1 - EPS) out.push(`the object is assembled at the end: the last snap lands after ${spec.duration_s - 1} s (now ${lastBack} s)`);
  const keys = spec.camera_keys;
  keys.forEach((k, i) => {
    const prev = keys[i - 1];
    if (prev && k.position.every((v, j) => Math.abs(v - prev.position[j]!) < 0.5) && k.target.every((v, j) => Math.abs(v - prev.target[j]!) < 0.5) && k.lens_mm === prev.lens_mm) {
      out.push(`camera keys at ${prev.t} s and ${k.t} s are the same: no static camera, keep it flowing`);
    }
  });
  return out;
}

/** Spec Y10: the stricter of the YAKLASIM margins and the calibrated area on every edge (bottom is a y). */
export function yaklasimSafeArea(a: SafeArea): SafeArea {
  const M = YAKLASIM.margins;
  return { top: Math.max(a.top, M.top), bottom: Math.min(a.bottom, 1920 - M.bottom), right: Math.max(a.right, M.right), left: Math.max(a.left, M.left) };
}

/**
 * Spec Y14: the music is fixed — 120 BPM, A minor, Am–F–C–G from frame 0, the drums thin out on every macro beat. Written as a MusicScore so
 * the fixer, the audio reviewer and compose read it like any score; the YAKLASIM generator (audio_service.yaklasim_audio) renders it.
 */
export function yaklasimScore(sb: Pick<Storyboard, 'duration_s' | 'beats'>): MusicScore {
  const chords = ['Am', 'F', 'C', 'G'];
  const full = (i: number, t0: number, t1: number) => ({ id: `full_${i}`, t_start: t0, t_end: t1, chords, energy: 0.9, layers: [
    { instrument: 'pad' as const, pattern: 'sustain', level: 0.6 }, { instrument: 'bass' as const, pattern: 'pulse', level: 0.7 }, { instrument: 'drums' as const, pattern: 'four', level: 0.8 }] });
  const sparse = (i: number, t0: number, t1: number) => ({ id: `macro_${i}`, t_start: t0, t_end: t1, chords, energy: 0.55, layers: [
    { instrument: 'pad' as const, pattern: 'sustain', level: 0.6 }, { instrument: 'bass' as const, pattern: 'pulse', level: 0.7 }, { instrument: 'drums' as const, pattern: 'half', level: 0.5 }] });
  const sections: MusicScore['sections'] = [];
  let t = 0;
  let nf = 0;
  let nm = 0;
  for (const b of sb.beats.filter((x) => x.role === 'macro')) {
    if (b.t_start > t) sections.push(full(++nf, t, b.t_start));
    sections.push(sparse(++nm, b.t_start, b.t_end));
    t = b.t_end;
  }
  if (t < sb.duration_s) sections.push(full(++nf, t, sb.duration_s));
  return {
    version: 1, bpm: YAKLASIM.bpm, key: { root: 'A', mode: 'minor' }, duration_s: sb.duration_s,
    intent_tr: 'YAKLASIM: 120 BPM Am–F–C–G, 0. karede tam enerji, makroda yalnızca davul seyrelir; giriş ve çıkış yok (döngü).',
    sections, accents: [],
  };
}

/** The sparse-drum windows of a YAKLASIM score (its macro sections), for the generator. */
export const sparseWindows = (s: MusicScore): [number, number][] => s.sections.filter((x) => x.id.startsWith('macro_')).map((x) => [x.t_start, x.t_end]);
