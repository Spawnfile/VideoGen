import { GENERATED_MUSIC_TITLE, licenseVerdict, YAKLASIM, type AudioMode, type AudioPlan, type SfxName } from '@videogen/shared';
import type { AssetRecord } from '@videogen/db';

/** The scene events the sound planner reads (scene/events.json). */
type EventType = 'explode_start' | 'part_lock' | 'label_in' | 'zoom';
/** Spec Z5: only YAKLASIM's three low sines (the classic library sounds are gone). */
export const SFX_GAIN_DB: Record<SfxName, number> = { y_snap: -9, y_tap: -12, y_land: -7 };
export const MUSIC_GAIN_DB = -18;

export interface SfxCue { atMs: number; name: SfxName; source: string }

/**
 * YAKLASIM spec Y15: quiet for the first 5 s (only the music), then low sine sounds only — a snap when a part locks home, a tap on a flash
 * cut, a land on the last lock. No hook whoosh, ticks, label sounds or zoom swooshes; cues at least 0.25 s apart.
 */
export function planSfxYaklasim(o: { events: { id: string; type: EventType; frame: number }[]; beats: { id: string; t_start: number; transition?: string }[]; fps: number; durationS: number }): SfxCue[] {
  const from = YAKLASIM.sfxFromS * 1000;
  const end = Math.max(0, Math.round(o.durationS * 1000) - 50);
  const locks = o.events.filter((e) => e.type === 'part_lock').map((e) => ({ atMs: Math.round((e.frame / o.fps) * 1000), source: `event:${e.id}` })).sort((a, b) => a.atMs - b.atMs);
  const last = locks.at(-1);
  const raw: SfxCue[] = [
    ...locks.map((l) => ({ atMs: l.atMs, name: (l === last ? 'y_land' : 'y_snap') as SfxName, source: l.source })),
    ...o.beats.filter((b) => b.transition === 'flash').map((b) => ({ atMs: Math.round(b.t_start * 1000), name: 'y_tap' as SfxName, source: `beat:${b.id}` })),
  ].filter((c) => c.atMs >= from).map((c) => ({ ...c, atMs: Math.min(c.atMs, end) }));
  // The land wins its moment, then the snaps (the lock itself), then the taps.
  const rank = (c: SfxCue) => (c.name === 'y_land' ? 0 : c.name === 'y_snap' ? 1 : 2);
  const kept: SfxCue[] = [];
  for (const c of raw.sort((a, b) => a.atMs - b.atMs || rank(a) - rank(b))) if (!kept.some((k) => Math.abs(k.atMs - c.atMs) < 250)) kept.push(c);
  return kept;
}

export class LicenseError extends Error {
  constructor(message: string) { super(message); this.name = 'LicenseError'; }
}
export interface SoundPlan {
  cues: (SfxCue & { assetId: string; gainDb: number })[];
  /** The music step's fixed YAKLASIM stem (no ledger asset, no attribution). */
  music: { generatedSha: string; title: string; license: string; gainDb: number };
}
/** The music step's rendered music_stem. */
export interface GeneratedMusic { sha: string; file: string }
export const GENERATED_MUSIC_LICENSE = 'LicenseRef-VideoGen-Generated';

/** The stored verdict and today's policy (review #3: a tightened license list or a cleared attribution also blocks). */
const permitted = (a: AssetRecord) => a.allowed && licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: a.kind }).allowed;

/** Spec §9: the render refuses a sound that is not in the ledger or not allowed (checked again here, at use). `plan` (H4): excluded sounds drop out, the offset adds to every cue, the music gain is the plan's. */
export function soundPlan(cues: SfxCue[], library: Record<SfxName, AssetRecord>, generated: GeneratedMusic, plan?: AudioPlan): SoundPlan {
  const out = cues.filter((c) => !plan?.sfx.exclude.includes(c.name)).map((c) => {
    const a = library[c.name];
    if (!a || !permitted(a) || a.kind !== 'sfx') throw new LicenseError(`izinsiz ses: ${c.name}`);
    return { ...c, assetId: a.id, gainDb: SFX_GAIN_DB[c.name] + (plan?.sfx.gain_offset_db ?? 0) };
  });
  return { cues: out, music: { generatedSha: generated.sha, title: GENERATED_MUSIC_TITLE, license: GENERATED_MUSIC_LICENSE, gainDb: plan?.music.gain_db ?? MUSIC_GAIN_DB } };
}

/** H3/H4: the deterministic default mix — the fixed music at MUSIC_GAIN_DB, the cues as they are. */
export function defaultAudioPlan(o: { mode: AudioMode }): AudioPlan {
  return { version: 1, mode: o.mode, music: { source: 'generated', asset_id: null, gain_db: MUSIC_GAIN_DB }, vo_gain_db: 0, duck_db: 12, sfx: { gain_offset_db: 0, exclude: [] }, mastering: { target_lufs: -14, tp: -1 } };
}

/**
 * H3: the stored plan wins (a replay never changes); without one the default is computed in memory (`persist: true`, written by compose's
 * run only). Spec Z5: the music is always the music step's stem — none rendered, or a stored plan that names a ledger track, is a license error.
 */
export function effectiveAudioPlan(o: { stored: AudioPlan | null; mode: AudioMode; generated: GeneratedMusic | null }): { plan: AudioPlan; persist: boolean; generated: GeneratedMusic } {
  if (!o.generated) throw new LicenseError('üretilen müzik bulunamadı (music adımı çalışmadı)');
  if (!o.stored) return { plan: defaultAudioPlan({ mode: o.mode }), persist: true, generated: o.generated };
  if (o.stored.music.source !== 'generated' || o.stored.music.asset_id !== null) throw new LicenseError('ses planı defterden bir müzik istiyor; müzik sabit YAKLASIM müziğidir');
  return { plan: o.stored, persist: false, generated: o.generated };
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
