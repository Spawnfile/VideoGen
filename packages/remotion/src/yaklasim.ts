import { plainText, type SafeArea } from '@videogen/shared/browser';
import { activeBeat, DRAFT_FPS, safeRect, type DraftBeat, type DraftProps, type Rect, type TextBox } from './props.ts';

/**
 * YAKLASIM look (spec Y9–Y11), the pure half: where the text sits, how big, what the flash/shake/zoom does on a frame, how the counter
 * climbs and how a new line pops in. yaklasim-layer.tsx draws it; layout.json measures it with the same numbers.
 */
export const Y_FONT = '"Montserrat", "DejaVu Sans", sans-serif';
/** Montserrat 900 is wide: a generous per-character width, like the legacy layer's 0.66 em for Inter. */
const CHAR_EM = 0.74;
const LINE_H = 1.08;

export function yaklasimLayout(width: number, height: number, area: SafeArea): { safe: Rect; textTop: number; hookFont: number; lineFont: number; counterFont: number; centerX: number; maxW: number } {
  const s = width / 1080;
  const safe = safeRect(width, height, area);
  return {
    safe, textTop: safe.top + Math.round(30 * s), hookFont: Math.round(84 * s), lineFont: Math.round(76 * s), counterFont: Math.round(104 * s),
    centerX: Math.round((safe.left + safe.right) / 2), maxW: safe.right - safe.left,
  };
}

export function wrap(text: string, font: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && next.length * font * CHAR_EM > maxW) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** The text a beat shows: the hook on the first beat and on any beat that repeats it (the loop), else the beat's own line. */
export function beatText(p: Pick<DraftProps, 'hook' | 'beats'>, index: number): { text: string; kind: 'hook' | 'beat' } {
  const b = p.beats[index]!;
  return index === 0 || plainText(b.text) === plainText(p.hook) ? { text: p.hook, kind: 'hook' } : { text: b.text, kind: 'beat' };
}

/** Frames since the active beat started (the pop-in and the counter run on it). */
export const sinceBeat = (b: DraftBeat, frame: number) => frame - Math.round(b.t_start * DRAFT_FPS);

/** Spec Y9: new text appears at once (no fade, no slide) and settles from 94 % to full size over 4 frames. Frame 0 is the cover. */
export const textScale = (d: number) => (d >= 4 ? 1 : 0.94 + (0.06 * Math.max(0, d)) / 4);

/** Spec Y11: a flash cut whitens 4 frames and shakes 10; a zoom cut punches in; nothing on frame 0 (the cover) or plain cuts. */
export function flashAt(beats: DraftBeat[], frame: number): { white: number; dx: number; dy: number; zoom: number } {
  const none = { white: 0, dx: 0, dy: 0, zoom: 1 };
  for (const b of beats) {
    const f0 = Math.round(b.t_start * DRAFT_FPS);
    const d = frame - f0;
    if (f0 === 0 || d < 0 || d >= 10 || (b.transition !== 'flash' && b.transition !== 'zoom')) continue;
    const zoom = 1 + 0.035 * Math.exp(-d / 2.5);
    if (b.transition === 'zoom') return { ...none, zoom };
    const amp = 12 * Math.exp(-d / 3);
    return { white: d < 4 ? 0.55 * (1 - d / 4) : 0, dx: Math.sin(d * 2.7) * amp, dy: Math.cos(d * 3.3) * amp, zoom };
  }
  return none;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** Spec Y11: the counter climbs fast (ease-out) and lands on the exact verified number (BigInt: no float rounding). */
export function counterText(value: string, progress: number): string {
  const p = Math.min(1, Math.max(0, progress));
  if (p >= 1) return group(value.replace(/^0+(?=\d)/, ''));
  const k = 1 - (1 - p) ** 3;
  const scaled = (BigInt(value) * BigInt(Math.round(k * 1_000_000))) / 1_000_000n;
  return group(scaled.toString());
}
/** The counter reaches its value at 70 % of the beat. */
export const counterProgress = (b: DraftBeat, frame: number) => sinceBeat(b, frame) / Math.max(1, 0.7 * (b.t_end - b.t_start) * DRAFT_FPS);

/** Where the YAKLASIM layer draws text at `frame` (centred, top band), for layout.json and the G6 check. */
export function yaklasimBoxes(p: Pick<DraftProps, 'width' | 'height' | 'hook' | 'beats' | 'safeArea'>, frame: number): TextBox[] {
  const L = yaklasimLayout(p.width, p.height, p.safeArea!);
  const active = activeBeat(p.beats, frame / DRAFT_FPS);
  if (!active) return [];
  const r = (b: number[]) => b.map((v) => Math.round(v)) as [number, number, number, number];
  const out: TextBox[] = [];
  let y = L.textTop;
  const block = (kind: TextBox['kind'], text: string, font: number) => {
    const lines = wrap(text, font, L.maxW);
    const w = Math.min(L.maxW, Math.max(...lines.map((l) => l.length * font * CHAR_EM)));
    const h = lines.length * font * LINE_H;
    out.push({ kind, box: r([L.centerX - w / 2, y, L.centerX + w / 2, y + h]) });
    y += h + Math.round(18 * (p.width / 1080));
  };
  const b = active.beat;
  if (b.role === 'counter' && b.counter) block('counter', counterText(b.counter.value, 1), L.counterFont);
  const t = beatText(p, active.index);
  block(t.kind, plainText(t.text), t.kind === 'hook' ? L.hookFont : L.lineFont);
  return out;
}
