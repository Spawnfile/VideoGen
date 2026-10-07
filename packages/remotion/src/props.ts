import type { CaptionPage, ChannelStyle, SceneSpec, Storyboard } from '@videogen/shared/browser';

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
  // Only anchors inside the frame: a label whose line runs off-frame points at a part the viewer cannot see.
  const visible = anchors.filter((x) => x.at && x.at[0] >= 0 && x.at[0] <= width && x.at[1] >= 0 && x.at[1] <= height);
  for (const a of visible.slice(0, MAX_LABELS).sort((p, q) => p.at![1] - q.at![1])) {
    const [ax, ay] = a.at!;
    // Generous per-character width (Inter / DejaVu with Turkish diacritics ≈ 0.6 em); a tighter guess ellipsised "Gövde" in the first real draft.
    const w = Math.min(area.right - area.left, Math.round(a.text.length * font * 0.66 + 2 * pad));
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

/** Remotion composition id of the final layer (spec §7.1 step 8, plan E7). */
export const FINAL_COMPOSITION = 'Final3D';
/** The draft props at 1080×1920 plus the URL base of the Blender PNG frames (served once, like the GLB). */
export type FinalProps = DraftProps & {
  framesUrl: string;
  /** M5c H15: word-timed caption pages of a VO final (silent finals and drafts have none: the key is absent, not empty). */
  captions?: CaptionPage[];
};

export function finalProps(o: Omit<Parameters<typeof draftProps>[0], 'width' | 'height'> & { framesUrl: string; captions?: CaptionPage[] }): FinalProps {
  const { captions, ...rest } = o;
  return { ...draftProps({ ...rest, width: 1080, height: 1920 }), framesUrl: o.framesUrl, ...(captions ? { captions } : {}) };
}
export const frameUrl = (base: string, frame: number) => `${base}/f${String(frame).padStart(5, '0')}.png`;

/** A text box on screen (px), as Overlay draws it; layout.json lists them (spec §7.4, plan E9). */
export interface TextBox { kind: 'hook' | 'beat' | 'label' | 'caption'; id?: string; box: [number, number, number, number] }

/** The caption page on screen at `ms` (H15), if any; the active word is the last one started. */
export function activeCaption(pages: CaptionPage[] | undefined, ms: number): { page: CaptionPage; word: number } | null {
  const page = pages?.find((c) => ms >= c.start_ms && ms < c.end_ms);
  if (!page) return null;
  return { page, word: Math.max(0, page.words.findLastIndex((w) => ms >= w.start_ms)) };
}

/** The generous per-character width of placeLabels (M4c ruling: 0.66 em; Inter / DejaVu with Turkish diacritics ≈ 0.6). */
const textWidth = (text: string, font: number) => text.length * font * 0.66;

/**
 * Greedy word wrap with the same width estimate (the browser wraps at least as early as this). A word wider than a line is cut into
 * line-sized pieces, as Overlay's `overflow-wrap: anywhere` does (review #7: otherwise it would overflow into the unsafe band).
 */
export function wrapLines(text: string, font: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const per = Math.max(1, Math.floor(maxWidth / (font * 0.66)));
  const words = text.split(/\s+/).filter(Boolean).flatMap((w) => (w.length <= per ? [w] : Array.from({ length: Math.ceil(w.length / per) }, (_, i) => w.slice(i * per, (i + 1) * per))));
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, font) > maxWidth) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Plan E9: where Overlay draws text at `frame`. Label boxes are exact (Overlay positions them absolutely); the hook and beat boxes
 * are estimates with the same generous width and the line heights Overlay uses, plus the plate padding.
 */
export function overlayBoxes(p: Pick<DraftProps, 'width' | 'height' | 'hook' | 'beats'> & { captions?: CaptionPage[] }, frame: number, labels: LabelBox[]): TextBox[] {
  const L = draftLayout(p.width, p.height);
  const s = p.width / 1080;
  const padX = 14 * s;
  const padY = 6 * s;
  const maxW = L.safe.right - L.safe.left;
  const r = (b: [number, number, number, number]) => b.map((v) => Math.round(v)) as [number, number, number, number];
  const boxes: TextBox[] = labels.map((b) => ({ kind: 'label', id: b.id, box: r([b.x, b.y, b.x + b.w, b.y + b.h]) }));
  const beat = activeBeat(p.beats, frame / DRAFT_FPS);
  const block = (text: string, font: number, lineH: number) => {
    const lines = wrapLines(text, font, maxW - 2 * padX);
    return { w: Math.min(maxW, Math.max(...lines.map((l) => textWidth(l, font))) + 2 * padX), h: lines.length * font * lineH };
  };
  const cap = activeCaption(p.captions, (frame * 1000) / DRAFT_FPS);
  const bottom = p.height - L.lineBottom;
  if (beat?.index === 0) {
    const b = block(p.hook, L.hookFont, 1.15);
    boxes.push({ kind: 'hook', box: r([L.safe.left, L.hookTop - padY, L.safe.left + b.w, L.hookTop + b.h + padY]) });
  } else if (beat && p.captions?.length) {
    // VO final: the beat line gives the bottom band to the captions and sits in the top band.
    const b = block(beat.beat.text, L.lineFont, 1.25);
    boxes.push({ kind: 'beat', box: r([L.safe.left, L.hookTop - padY, L.safe.left + b.w, L.hookTop + b.h + padY]) });
  } else if (beat) {
    const b = block(beat.beat.text, L.lineFont, 1.25);
    boxes.push({ kind: 'beat', box: r([L.safe.left, bottom - b.h - padY, L.safe.left + b.w, bottom + padY]) });
  }
  if (cap) {
    const b = block(cap.page.words.map((w) => w.text).join(' '), L.lineFont, 1.25);
    boxes.push({ kind: 'caption', box: r([L.safe.left, bottom - b.h - padY, L.safe.left + b.w, bottom + padY]) });
  }
  return boxes;
}
