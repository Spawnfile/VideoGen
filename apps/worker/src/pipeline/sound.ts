import { createHash } from 'node:crypto';
import { licenseVerdict, type SfxName } from '@videogen/shared';
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

/** Spec §9: the render refuses an asset that is not in the ledger or not allowed (checked again here, at use). */
export function soundPlan(cues: SfxCue[], library: Record<SfxName, AssetRecord>, music: AssetRecord | null): SoundPlan {
  const out = cues.map((c) => {
    const a = library[c.name];
    if (!a || !permitted(a) || a.kind !== 'sfx') throw new LicenseError(`izinsiz ses: ${c.name}`);
    return { ...c, assetId: a.id, gainDb: SFX_GAIN_DB[c.name] };
  });
  if (music && (!permitted(music) || music.kind !== 'music')) throw new LicenseError(`izinsiz müzik: ${music.title} (${music.licenseSpdx})`);
  return { cues: out, music: music ? { assetId: music.id, title: music.title, license: music.licenseSpdx, attribution: music.attribution, gainDb: MUSIC_GAIN_DB } : null };
}
