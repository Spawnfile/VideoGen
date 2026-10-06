import type { ChannelStyle, SceneSpec, Storyboard } from '@videogen/shared/browser';

/** Remotion composition id of the draft (spec §7.1 step 5). */
export const DRAFT_COMPOSITION = 'Draft3D';
export const DRAFT_FPS = 30;
/** Spec §8.1 D5: at most six labels on screen at once (placed by construction, never asked to the reviewer). */
export const MAX_LABELS = 6;

export interface DraftBeat { t_start: number; t_end: number; text: string; parts: string[] }
/**
 * Everything the composition needs, serialisable (Remotion inputProps and Player props). A type alias, not an interface:
 * Remotion props must be assignable to Record<string, unknown>.
 */
export type DraftProps = {
  /** GLB URL: the media endpoint in the Player, a one-time token URL in the renderer (plan C14). */
  glbUrl: string;
  /** camera_track.json: vertical FOV (radians) of every frame 0…frames (glTF does not animate the lens). */
  yfov: number[];
  /** SceneSpec.frames: the last frame; the composition has frames + 1. */
  frames: number;
  width: number;
  height: number;
  background: ChannelStyle['background'];
  text: ChannelStyle['text'];
  lighting: ChannelStyle['lighting'];
  hook: string;
  beats: DraftBeat[];
  /** Part id → Turkish label. */
  labels: Record<string, string>;
};

export function draftProps(o: {
  glbUrl: string; yfov: number[]; width: number; height: number;
  scene: Pick<SceneSpec, 'frames' | 'parts'>; storyboard: Pick<Storyboard, 'hook' | 'beats'>; style: Pick<ChannelStyle, 'background' | 'text' | 'lighting'>;
}): DraftProps {
  return {
    glbUrl: o.glbUrl, yfov: o.yfov, frames: o.scene.frames, width: o.width, height: o.height,
    background: o.style.background, text: o.style.text, lighting: o.style.lighting,
    hook: o.storyboard.hook.text_tr,
    beats: o.storyboard.beats.map((b) => ({ t_start: b.t_start, t_end: b.t_end, text: b.onscreen_text.tr, parts: b.parts.slice(0, MAX_LABELS) })),
    labels: Object.fromEntries(o.scene.parts.map((p) => [p.id, p.name_tr])),
  };
}

/** The beat on screen at `t` seconds (the last beat holds through the final frame). */
export function activeBeat(beats: DraftBeat[], t: number): { index: number; beat: DraftBeat } | null {
  if (!beats.length) return null;
  const i = beats.findIndex((b) => t >= b.t_start && t < b.t_end);
  const index = i >= 0 ? i : t >= beats.at(-1)!.t_end ? beats.length - 1 : 0;
  return { index, beat: beats[index]! };
}

export interface Rect { left: number; top: number; right: number; bottom: number }
/** Spec §8.1 G6 at 1080×1920 (no text above 150 px, below 1510 px or in the right 130 px), scaled; plus a 24 px left margin. */
export function safeRect(width: number, height: number): Rect {
  const sx = width / 1080;
  const sy = height / 1920;
  return { left: Math.round(24 * sx), top: Math.round(150 * sy), right: Math.round(width - 130 * sx), bottom: Math.round(1510 * sy) };
}

/** Text bands of the draft: the hook at the top of the safe area, the beat line at its bottom; labels live between them. */
export function draftLayout(width: number, height: number): { safe: Rect; hookTop: number; hookFont: number; lineBottom: number; lineFont: number; labelArea: Rect } {
  const s = width / 1080;
  const safe = safeRect(width, height);
  const hookFont = Math.round(68 * s); // D5: hook ≥ 64 px at 1080
  const lineFont = Math.round(52 * s);
  const hookTop = safe.top + Math.round(16 * s);
  const lineBottom = height - safe.bottom + Math.round(16 * s);
  return { safe, hookTop, hookFont, lineBottom, lineFont, labelArea: { ...safe, top: hookTop + Math.round(hookFont * 2.4), bottom: safe.bottom - Math.round(lineFont * 2.6) } };
}

export interface LabelBox { id: string; text: string; ax: number; ay: number; x: number; y: number; w: number; h: number; font: number }

/**
 * Labels beside their anchors, inside `area` (default: the safe area), never overlapping: top-down by anchor height, then pushed
 * up from the bottom edge if the stack overflows. At most MAX_LABELS; an anchor behind the camera (null) gets no label.
 */
export function placeLabels(anchors: { id: string; text: string; at: [number, number] | null }[], width: number, height: number, area: Rect = safeRect(width, height)): LabelBox[] {
  const s = width / 1080;
  const font = Math.round(44 * s); // D5: labels 40–56 px at 1080
  const pad = Math.round(12 * s);
  const h = font + 2 * pad;
  const gap = Math.round(10 * s);
  const reach = Math.round(40 * s);
  const boxes: LabelBox[] = [];
  let floor = area.top;
  for (const a of anchors.filter((x) => x.at).slice(0, MAX_LABELS).sort((p, q) => p.at![1] - q.at![1])) {
    const [ax, ay] = a.at!;
    const w = Math.min(area.right - area.left, Math.round(a.text.length * font * 0.56 + 2 * pad));
    const x = Math.max(area.left, Math.min(ax + reach + w <= area.right ? ax + reach : ax - reach - w, area.right - w));
    const y = Math.max(floor, Math.round(ay - h / 2));
    boxes.push({ id: a.id, text: a.text, ax, ay, x, y, w, h, font });
    floor = y + h + gap;
  }
  for (let i = boxes.length - 1, limit = area.bottom; i >= 0; i--) {
    const b = boxes[i]!;
    b.y = Math.min(b.y, limit - b.h);
    limit = b.y - gap;
  }
  return boxes;
}
