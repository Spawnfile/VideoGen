/** Spec §13.4 keyboard shortcuts: Space play/pause · J back 5 s · K pause · L forward 5 s · N new production. */
export interface PlayerControl { kind: 'final' | 'draft'; toggle(): void; pause(): void; seekBy(seconds: number): void; seekTo(seconds: number): void }
export type ShortcutAction = 'toggle' | 'back' | 'pause' | 'forward' | 'new';

let active: PlayerControl | null = null;
/** The player on screen registers itself (one at a time: the visible draft tab). */
export function setActivePlayer(c: PlayerControl | null): void {
  active = c;
  if (c?.kind === 'final' && pendingSeek !== null) { const s = pendingSeek; pendingSeek = null; c.seekTo(s); }
}
let pendingSeek: number | null = null;
let showFinal: (() => void) | null = null;
/** The tab strip registers how to open the Final tab. */
export function setShowFinal(fn: (() => void) | null): void { showFinal = fn; }
/** Review evidence times belong to the final: switch to the Final tab if needed, then seek there. The draft player is never seeked. */
export function seekFinal(seconds: number): void {
  if (active?.kind === 'final') { active.seekTo(seconds); return; }
  if (!showFinal) return;
  pendingSeek = seconds;
  showFinal();
}
export function activePlayer(): PlayerControl | null { return active; }

const KEYS: Record<string, ShortcutAction> = { ' ': 'toggle', j: 'back', k: 'pause', l: 'forward', n: 'new' };

/** Held down, only J and L keep acting (seeking on); a held Space, K or N would toggle or open again and again. */
const REPEATS = new Set<ShortcutAction>(['back', 'forward']);

/**
 * Null while typing, with a modifier, or for Space on a focused button (Space presses the button). M7 Y19: also null for a Shift-modified
 * letter (a capital typed elsewhere; Caps Lock without Shift still works), during IME composition, and for a key repeat other than J and L.
 */
export function shortcutFor(e: {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey?: boolean; repeat?: boolean; isComposing?: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.key === 'Process') return null;
  if (e.shiftKey && /^\p{L}$/u.test(e.key)) return null;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return null;
  if (e.key === ' ' && (tag === 'BUTTON' || tag === 'VIDEO')) return null;
  const action = KEYS[e.key.toLocaleLowerCase('tr')] ?? null;
  return action && e.repeat && !REPEATS.has(action) ? null : action;
}
