/** Spec §13.4 keyboard shortcuts: Space play/pause · J back 5 s · K pause · L forward 5 s · N new production. */
export interface PlayerControl { toggle(): void; pause(): void; seekBy(seconds: number): void }
export type ShortcutAction = 'toggle' | 'back' | 'pause' | 'forward' | 'new';

let active: PlayerControl | null = null;
/** The player on screen registers itself (one at a time: the visible draft tab). */
export function setActivePlayer(c: PlayerControl | null): void { active = c; }
export function activePlayer(): PlayerControl | null { return active; }

const KEYS: Record<string, ShortcutAction> = { ' ': 'toggle', j: 'back', k: 'pause', l: 'forward', n: 'new' };

/** Null while typing, with a modifier, or for Space on a focused button (Space presses the button). */
export function shortcutFor(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return null;
  if (e.key === ' ' && (tag === 'BUTTON' || tag === 'VIDEO')) return null;
  return KEYS[e.key.toLocaleLowerCase('tr')] ?? null;
}
