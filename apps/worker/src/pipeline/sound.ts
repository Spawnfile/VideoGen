import { createHash } from 'node:crypto';
import { licenseVerdict, type AudioMode, type AudioPlan, type SfxName } from '@videogen/shared';
import type { AssetRecord } from '@videogen/db';

/** Plan E10: scene events → sounds (spec §7.6: explode_start → whoosh, part_lock → click/snap). */
export const SFX_FOR_EVENT = { explode_start: 'whoosh', part_lock: 'click', label_in: 'tick', zoom: 'swoosh' } as const satisfies Record<string, SfxName>;
export const SFX_GAIN_DB: Record<SfxName, number> = { whoosh: -6, swoosh: -8, click: -10, snap: -8, tick: -16, thud: -6 };
export const MUSIC_GAIN_DB = -18;
/** Storyboard sfx_cues are free text (≤ 40 chars): Turkish and English words that name a library sound. */
const SYNONYMS: [string, SfxName][] = [
  ['whoosh', 'whoosh'], ['vuş', 'whoosh'], ['vınn', 'whoosh'], ['swoosh', 'swoosh'], ['vızz', 'swoosh'], ['click', 'click'], ['klik', 'click'], ['tık', 'click'],
  ['snap', 'snap'], ['çıt', 'snap'], ['tick', 'tick'], ['thud', 'thud'], ['güm', 'thud'], ['tok', 'thud'],
];
export function matchSfx(word: string): SfxName | null {
  const w = word.toLocaleLowerCase('tr');
  return SYNONYMS.find(([k]) => w.includes(k))?.[1] ?? null;
}

export interface SfxCue { atMs: number; name: SfxName; source: string }
type EventType = keyof typeof SFX_FOR_EVENT;
const PRIORITY = (source: string) => (source === 'hook' ? 0 : source.startsWith('beat:') ? 1 : 2);

/** Deterministic cue list: the hook whoosh at 0 ms (spec §8.1 D1/D6: sound ≤ 0.15 s), one cue per 2 frames, ≤ 3 of a sound per 10 s. */
export function planSfx(o: { events: { id: string; type: EventType; frame: number }[]; beats: { id: string; t_start: number; sfx_cues: string[] }[]; fps: number; durationS: number }): SfxCue[] {
  const end = Math.max(0, Math.round(o.durationS * 1000) - 50);
  const raw: SfxCue[] = [{ atMs: 0, name: 'whoosh', source: 'hook' }];
  for (const b of o.beats) for (const c of b.sfx_cues) { const n = matchSfx(c); if (n) raw.push({ atMs: Math.round(b.t_start * 1000), name: n, source: `beat:${b.id}` }); }
  for (const e of o.events) raw.push({ atMs: Math.round((e.frame / o.fps) * 1000), name: SFX_FOR_EVENT[e.type], source: `event:${e.id}` });
  const sorted = raw.map((c) => ({ ...c, atMs: Math.min(Math.max(0, c.atMs), end) })).sort((a, b) => a.atMs - b.atMs || PRIORITY(a.source) - PRIORITY(b.source));
  const gap = Math.round(2000 / o.fps);
  const kept: SfxCue[] = [];
  for (const c of sorted) {
    if (kept.some((k) => Math.abs(k.atMs - c.atMs) < gap)) continue;
    if (kept.filter((k) => k.name === c.name && c.atMs - k.atMs < 10_000).length >= 3) continue;
    kept.push(c);
  }
  return kept;
}

/** Plan E11: an allowed music track chosen by the video id's hash (stable across reruns of the same video). */
export function pickMusic<A extends Pick<AssetRecord, 'id' | 'kind' | 'allowed'>>(assets: A[], seed: string): A | null {
  const ok = assets.filter((a) => a.kind === 'music' && a.allowed).sort((a, b) => a.id.localeCompare(b.id));
  if (!ok.length) return null;
  return ok[parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) % ok.length]!;
}

export class LicenseError extends Error {
  constructor(message: string) { super(message); this.name = 'LicenseError'; }
}
export interface SoundPlan {
  cues: (SfxCue & { assetId: string; gainDb: number })[];
  music: { assetId: string; title: string; license: string; attribution: string | null; gainDb: number } | null;
}

/** The stored verdict and today's policy (review #3: a tightened license list or a cleared attribution also blocks). */
const permitted = (a: AssetRecord) => a.allowed && licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: a.kind }).allowed;

/**
 * Plan F18: an allowed SFX imported into the ledger whose title or tag names a library sound (matchSfx) takes that sound's place; among several
 * the smallest id wins. The library's own assets are never candidates; the license gate still checks at use (soundPlan).
 */
export function withImportedSfx(library: Record<SfxName, AssetRecord>, imported: AssetRecord[]): Record<SfxName, AssetRecord> {
  const own = new Set(Object.values(library).map((a) => a.id));
  const out = { ...library };
  const claimed = new Set<SfxName>();
  for (const a of [...imported].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    if (own.has(a.id) || a.kind !== 'sfx' || !permitted(a)) continue;
    const name = [a.title, ...a.tags].map(matchSfx).find((n): n is SfxName => n !== null && !claimed.has(n));
    if (!name) continue;
    claimed.add(name);
    out[name] = a;
  }
  return out;
}

/** Spec §9: the render refuses an asset that is not in the ledger or not allowed (checked again here, at use). `plan` (H4): excluded sounds drop out, the offset adds to every cue, the music gain is the plan's. */
export function soundPlan(cues: SfxCue[], library: Record<SfxName, AssetRecord>, music: AssetRecord | null, plan?: AudioPlan): SoundPlan {
  const out = cues.filter((c) => !plan?.sfx.exclude.includes(c.name)).map((c) => {
    const a = library[c.name];
    if (!a || !permitted(a) || a.kind !== 'sfx') throw new LicenseError(`izinsiz ses: ${c.name}`);
    return { ...c, assetId: a.id, gainDb: SFX_GAIN_DB[c.name] + (plan?.sfx.gain_offset_db ?? 0) };
  });
  if (music && (!permitted(music) || music.kind !== 'music')) throw new LicenseError(`izinsiz müzik: ${music.title} (${music.licenseSpdx})`);
  return { cues: out, music: music ? { assetId: music.id, title: music.title, license: music.licenseSpdx, attribution: music.attribution, gainDb: plan?.music.gain_db ?? MUSIC_GAIN_DB } : null };
}

/**
 * H3/H4: the deterministic stand-in of the audio director. The defaults reproduce today's silent mix (music at MUSIC_GAIN_DB, SFX as is);
 * a missing music track is a valid plan (the "silent video needs music" rule lives in the preflight and the fixer, H10).
 */
export function defaultAudioPlan(o: { mode: AudioMode; music: AssetRecord | null }): AudioPlan {
  return { version: 1, mode: o.mode, music: { asset_id: o.music?.id ?? null, gain_db: MUSIC_GAIN_DB }, vo_gain_db: 0, duck_db: 12, sfx: { gain_offset_db: 0, exclude: [] }, mastering: { target_lufs: -14, tp: -1 } };
}

/**
 * H3: the stored plan wins (a later ledger addition never changes a replay); without one the default is computed in memory (`persist: true`,
 * written by compose's run only). A stored music track must still be permitted today. `music` are the ledger's allowed music tracks,
 * `seed` the video id of pickMusic. Returns the resolved music asset too.
 */
export function effectiveAudioPlan(o: { stored: AudioPlan | null; mode: AudioMode; music: AssetRecord[]; seed: string }): { plan: AudioPlan; persist: boolean; music: AssetRecord | null } {
  if (!o.stored) {
    const music = pickMusic(o.music, o.seed);
    return { plan: defaultAudioPlan({ mode: o.mode, music }), persist: true, music };
  }
  const id = o.stored.music.asset_id;
  if (id === null) return { plan: o.stored, persist: false, music: null };
  const music = o.music.find((a) => a.id === id);
  if (!music) throw new LicenseError(`müzik bulunamadı: ${id}`);
  if (!permitted(music) || music.kind !== 'music') throw new LicenseError(`izinsiz müzik: ${music.title} (${music.licenseSpdx})`);
  return { plan: o.stored, persist: false, music };
}

/** `lines`' merged windows (plateau from `preMs` before a line to `postMs` after it) of H9, in ms; two windows closer than both ramps merge. */
function duckWindows(lines: { start_ms: number; end_ms: number }[], o: { preMs: number; postMs: number; rampMs: number }): [number, number][] {
  const out: [number, number][] = [];
  for (const l of [...lines].sort((a, b) => a.start_ms - b.start_ms)) {
    const w: [number, number] = [Math.max(0, l.start_ms - o.preMs), l.end_ms + o.postMs];
    const last = out.at(-1);
    if (last && w[0] - last[1] <= 2 * o.rampMs) last[1] = Math.max(last[1], w[1]);
    else out.push(w);
  }
  return out;
}

/** H9 constants of the ducking envelope; part of the VO compose hash (a change re-composes). */
export const DUCK = { preMs: 150, postMs: 300, rampMs: 150 } as const;

/**
 * H9: the music's gain envelope as an ffmpeg `volume` expression (`eval=frame`; `t` in seconds): −`duckDb` from `preMs` before each VO line to `postMs`
 * after it, linear ramps of `rampMs` outside that plateau, 1 in the gaps; '1' without lines. SFX never see it. Deterministic text.
 */
export function duckingEnvelope(lines: { start_ms: number; end_ms: number }[], o: { duckDb: number; preMs: number; postMs: number; rampMs: number }): string {
  const wins = duckWindows(lines, o);
  if (!wins.length) return '1';
  // a negative time (a window starting at 0 ms) must print as `t+x`, not `t--x`
  const at = (ms: number) => (ms >= 0 ? `t-${(ms / 1000).toFixed(3)}` : `t+${(-ms / 1000).toFixed(3)}`);
  const sec = (ms: number) => (ms / 1000).toFixed(3);
  const r = sec(o.rampMs);
  const depth = (1 - 10 ** (-o.duckDb / 20)).toFixed(5);
  // one trapezoid per window: 0 → 1 over the ramp before the plateau, 1 → 0 over the ramp after it
  const traps = wins.map(([a, b]) => `clip(min((${at(a - o.rampMs)})/${r},(${sec(b + o.rampMs)}-t)/${r}),0,1)`);
  return `1-${depth}*(${traps.join('+')})`;
}
