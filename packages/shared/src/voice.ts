import { z } from 'zod';
import { SFX_NAMES } from './assets.ts';
import type { AudioMode, Beat, Storyboard } from './artifacts.ts';

/** Plan M5c T1: the voice contracts. A leaf module: only types from artifacts.ts (the fix-loop.ts pattern), values from assets.ts. */

// ---------------------------------------------------------------- narrator voice (H7, H8)

export const VOICE_ENGINES = ['chatterbox', 'freya'] as const;
export type VoiceEngine = (typeof VOICE_ENGINES)[number];
export const PRESET_VOICES: Record<VoiceEngine, readonly string[]> = { chatterbox: ['hazir'], freya: ['leyla'] };

const VoiceRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), id: z.string().trim().min(1).max(40) }),
  z.object({ kind: z.literal('clone'), asset_id: z.uuid() }),
]);
export type VoiceRef = z.infer<typeof VoiceRefSchema>;

export const NarratorVoiceSchema = z.object({ engine: z.enum(VOICE_ENGINES), voice: VoiceRefSchema }).superRefine((v, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (v.voice.kind === 'clone' && v.engine !== 'chatterbox') issue(['voice'], 'klon ses yalnızca chatterbox ile kullanılabilir');
  if (v.voice.kind === 'preset' && !PRESET_VOICES[v.engine].includes(v.voice.id)) issue(['voice', 'id'], `${v.engine} için hazır ses yok: ${v.voice.id}`);
});
export type NarratorVoice = z.infer<typeof NarratorVoiceSchema>;

/** K17 is PROVISIONAL: this is the working choice until the user approves a voice. */
export const DEFAULT_NARRATOR: Readonly<NarratorVoice> = Object.freeze({ engine: 'chatterbox', voice: Object.freeze({ kind: 'preset', id: 'hazir' }) } as const);

/** A cloned voice must be labelled as AI-generated (spec §8.1 G4). */
export const aigcRequired = (v: NarratorVoice): boolean => v.voice.kind === 'clone';

// ---------------------------------------------------------------- audio plan (H4)

export const AudioPlanSchema = z.object({
  version: z.number().int().min(1),
  mode: z.enum(['vo', 'silent']),
  /** null is valid in the schema; a silent video that is meant to ship needs music (H10, a preflight and fixer rule). */
  music: z.object({ asset_id: z.uuid().nullable(), gain_db: z.number().min(-30).max(-10) }),
  vo_gain_db: z.number().min(-6).max(6),
  duck_db: z.number().min(6).max(18),
  sfx: z.object({ gain_offset_db: z.number().min(-12).max(6), exclude: z.array(z.enum(SFX_NAMES)).max(SFX_NAMES.length) }),
  mastering: z.object({ target_lufs: z.literal(-14), tp: z.literal(-1) }),
}).superRefine((a, ctx) => {
  const dup = a.sfx.exclude.find((n, i) => a.sfx.exclude.indexOf(n) !== i);
  if (dup) ctx.addIssue({ code: 'custom', path: ['sfx', 'exclude'], message: `tekrarlanan ses adı: ${dup}` });
});
export type AudioPlan = z.infer<typeof AudioPlanSchema>;

// ---------------------------------------------------------------- voice track (H4)

const ms = z.number().int().min(0);
const VoiceLineSchema = z.object({
  beat_id: z.string().min(1).max(40), text_tr: z.string().min(1).max(300), normalized_tr: z.string().min(1).max(600),
  start_ms: ms, end_ms: ms, seed: z.number().int().min(0), attempts: z.number().int().min(1).max(10), cer: z.number().min(0), asr_tr: z.string().max(600),
});
export type VoiceLine = z.infer<typeof VoiceLineSchema>;
const VoiceWordSchema = z.object({ text: z.string().min(1).max(80), start_ms: ms, end_ms: ms, beat_id: z.string().min(1).max(40) });

export const VoiceTrackSchema = z.object({
  lines: z.array(VoiceLineSchema).min(1).max(24),
  words: z.array(VoiceWordSchema).max(2000),
  duration_ms: ms,
  provider: z.object({ engine: z.enum(VOICE_ENGINES), model: z.string().min(1).max(80), voice: VoiceRefSchema, aigc_label: z.boolean() }),
  facts: z.object({ first_word_s: z.number().min(0), syllables_per_s: z.number().min(0), max_cer: z.number().min(0) }),
}).superRefine((t, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const byBeat = new Map<string, VoiceLine>();
  t.lines.forEach((l, i) => {
    if (l.end_ms <= l.start_ms) issue(['lines', i, 'end_ms'], 'satır bitişi başlangıcından sonra olmalı');
    if (byBeat.has(l.beat_id)) issue(['lines', i, 'beat_id'], `tekrarlanan vuruş: ${l.beat_id}`);
    byBeat.set(l.beat_id, l);
    const prev = t.lines[i - 1];
    if (prev && l.start_ms < prev.end_ms) issue(['lines', i, 'start_ms'], 'satırlar çakışmamalı ve vuruş sırasında olmalı');
  });
  const last = t.lines.at(-1);
  if (last && t.duration_ms < last.end_ms) issue(['duration_ms'], 'duration_ms son satırdan önce bitemez');
  t.words.forEach((w, i) => {
    const line = byBeat.get(w.beat_id);
    if (!line) issue(['words', i, 'beat_id'], `satırı olmayan vuruş: ${w.beat_id}`);
    else if (w.start_ms < line.start_ms || w.end_ms > line.end_ms) issue(['words', i], 'kelime kendi satırının içinde olmalı');
    if (w.end_ms < w.start_ms) issue(['words', i, 'end_ms'], 'kelime bitişi başlangıcından önce');
    const prev = t.words[i - 1];
    if (prev && (w.start_ms < prev.start_ms || w.end_ms < prev.end_ms)) issue(['words', i], 'kelime zamanları monoton olmalı');
  });
});
export type VoiceTrack = z.infer<typeof VoiceTrackSchema>;

/** Spec §8.1 G4 as a rule (H8): a silent video passes; VO needs a track; a clone needs the AI label and a still-permitted reference. */
export function g4Gate(i: { audioMode: AudioMode; track: VoiceTrack | null; refPermitted: boolean }): boolean {
  if (i.audioMode === 'silent') return true;
  if (!i.track) return false;
  if (i.track.provider.voice.kind === 'preset') return true;
  return i.track.provider.aigc_label === true && i.refPermitted;
}

// ---------------------------------------------------------------- VO text guard (H6)

export const VO_CHARS_PER_S = 14;
const BEAT_OVERHEAD_S = 0.28;
const VO_MIN_S = 36;
const VO_MAX_S = 52;
const SPEAKABLE = /^[\p{Script=Latin}\d\s.,;:!?'"’‘“”()\-–%₺]*$/u;

/** What the TTS front end can read: no emoji, symbols or letter/digit mixes ("x2"). Unit words and "0,7" / "%50" / "₺15" are the normalizer's. */
export function voTextErrors(raw: string): string[] {
  const text = raw.normalize('NFC');
  const out: string[] = [];
  const bad = [...new Set([...text].filter((c) => !SPEAKABLE.test(c)))];
  if (bad.length) out.push(`okunamayan karakter: ${bad.join(' ')}`);
  const mixed = text.match(/\p{L}\d|\d\p{L}/u);
  if (mixed) out.push(`harf ve rakam bitişik okunamaz: ${mixed[0]}`);
  return out;
}

/** Rough spoken length: characters at 14 per second plus a pause per beat (M1's slow engines). */
export function estimateVoS(s: Storyboard): number {
  const chars = s.beats.reduce((n, b) => n + (b.vo_text?.tr.length ?? 0), 0);
  return chars / VO_CHARS_PER_S + s.beats.length * BEAT_OVERHEAD_S;
}

const trNum = (n: number) => n.toFixed(1).replace('.', ',');

/** `minS: false` skips the 36 s lower bound (the fixer's check only applies the character rule and the 52 s upper bound, H6). */
/** Longest beat on-screen text of a VO video: two lines at 52 px in the top band (T6). */
export const VO_ONSCREEN_MAX = 52;

export function storyboardVoErrors(s: Storyboard, o: { minS?: boolean } = {}): string[] {
  if (s.audio_mode !== 'vo') return [];
  const out: string[] = [];
  s.beats.forEach((b, i) => { for (const e of voTextErrors(b.vo_text?.tr ?? '')) out.push(`beats.${i}.vo_text: ${e}`); });
  // Top band of a VO final holds two 52 px lines (G6: a third would run into the label area).
  s.beats.forEach((b) => { if (b.onscreen_text.tr.length > VO_ONSCREEN_MAX) out.push(`vuruş ${b.id}: ekran yazısı seslendirmeli videoda en çok ${VO_ONSCREEN_MAX} karakter (üst bant iki satır)`); });
  const est = estimateVoS(s);
  if (est > VO_MAX_S) out.push(`seslendirme tahmini ${trNum(est)} sn: en çok ${VO_MAX_S} sn olmalı; VO metnini kısaltın`);
  else if (o.minS !== false && est < VO_MIN_S) out.push(`seslendirme tahmini ${trNum(est)} sn: en az ${VO_MIN_S} sn olmalı; VO metnini uzatın`);
  return out;
}

// ---------------------------------------------------------------- placement and retiming (H5, H13)

export const LINE_LEAD_S = 0.1;
export const LINE_GAP_S = 0.18;
export const MIN_BEAT_S = 1.2;
export const KEEP_TOLERANCE_S = 0.3;
/** Spec §7.6: at least 120 ms between two lines when the beats are kept. */
const KEEP_MIN_GAP_S = 0.12;
const MIN_TOTAL_S = 35;
const MAX_TOTAL_S = 55;

// Integer milliseconds inside; seconds only at the edges (±0.30 / ±0.31 thresholds must not meet float noise).
const toMs = (s: number) => Math.round(s * 1000);
const LEAD = toMs(LINE_LEAD_S);
const GAP = toMs(LINE_GAP_S);
const MIN_BEAT = toMs(MIN_BEAT_S);
const TOL = toMs(KEEP_TOLERANCE_S);
const KEEP_GAP = toMs(KEEP_MIN_GAP_S);
/** A short caption page merges with a neighbour only across a gap of at most this long. */
const MERGE_MAX_GAP_MS = 1000;

type Slot = Pick<Beat, 'id' | 't_start' | 't_end'>;

const neededMs = (lineMs: number) => Math.max(MIN_BEAT, LEAD + lineMs + GAP);

/** New beat lengths (ms): lead + line + gap, at least 1.2 s; below `padTo` the extra time is spread in proportion as gaps. */
function retimedLengths(durationsMs: number[], padTo: number): number[] {
  const need = durationsMs.map(neededMs);
  const total = need.reduce((a, b) => a + b, 0);
  if (total >= padTo) return need;
  // Floor shares plus the leftover milliseconds to the largest remainders: no share is ever negative.
  const pad = padTo - total;
  const shares = need.map((n) => ({ base: Math.floor((pad * n) / total), rem: (pad * n) % total }));
  let left = pad - shares.reduce((a, x) => a + x.base, 0);
  const order = shares.map((_, i) => i).sort((a, b) => shares[b]!.rem - shares[a]!.rem || a - b);
  for (const i of order) { if (left <= 0) break; shares[i]!.base++; left--; }
  return need.map((n, i) => n + shares[i]!.base);
}

function slotsFrom(ids: string[], lengths: number[]): { starts: number[]; beats: { id: string; t_start: number; t_end: number }[] } {
  let at = 0;
  const starts: number[] = [];
  const beats = ids.map((id, i) => {
    const t_start = at;
    at += lengths[i]!;
    starts.push(t_start + LEAD);
    return { id, t_start: t_start / 1000, t_end: at / 1000 };
  });
  return { starts, beats };
}

/**
 * Where each line starts. keep:false lays the beats out afresh (lead + line + gap, min 1.2 s; the first line at 0.10 s) and does NOT pad to 35 s:
 * the voice step must take the line starts from retimeStoryboard().starts_ms.
 * keep:true leaves the beats alone: line i+1 starts at max(its beat start + lead, line i end + 0.12 s); overflowS is how far each line runs past its beat.
 */
export function placeLines(beats: Slot[], durationsMs: number[], o: { keep: boolean }): { starts_ms: number[]; beats: { id: string; t_start: number; t_end: number }[]; overflowS: number[] } {
  if (beats.length !== durationsMs.length) throw new Error('beats and durations differ in length');
  if (!o.keep) {
    const { starts, beats: out } = slotsFrom(beats.map((b) => b.id), retimedLengths(durationsMs, 0));
    return { starts_ms: starts, beats: out, overflowS: starts.map(() => 0) };
  }
  const starts: number[] = [];
  const overflow: number[] = [];
  let prevEnd = -Infinity;
  beats.forEach((b, i) => {
    const start = Math.max(toMs(b.t_start) + LEAD, prevEnd + KEEP_GAP);
    const end = start + durationsMs[i]!;
    starts.push(start);
    overflow.push(Math.max(0, end - toMs(b.t_end)) / 1000);
    prevEnd = end;
  });
  return { starts_ms: starts, beats: beats.map((b) => ({ id: b.id, t_start: b.t_start, t_end: b.t_end })), overflowS: overflow };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A moment inside the old beats keeps its in-beat ratio in the new ones. */
function carry(at: number, from: Slot[], to: { t_start: number; t_end: number }[]): number {
  let k = from.findIndex((b) => at >= b.t_start && at < b.t_end);
  if (k < 0) k = at < (from[0]?.t_start ?? 0) ? 0 : from.length - 1;
  const f = from[k]!;
  const ratio = clamp((at - f.t_start) / (f.t_end - f.t_start), 0, 1);
  return to[k]!.t_start + ratio * (to[k]!.t_end - to[k]!.t_start);
}

const shiftOf = (from: Slot[], to: { t_start: number; t_end: number }[]) =>
  Math.max(0, ...from.flatMap((b, i) => [Math.abs(toMs(to[i]!.t_start) - toMs(b.t_start)), Math.abs(toMs(to[i]!.t_end) - toMs(b.t_end))])) / 1000;

/** The storyboard laid out on the real line durations (K26): 35–55 s; rehook/payoff follow their beat and are clamped into the schema ranges. */
export function retimeStoryboard(s: Storyboard, durationsMs: number[]): { storyboard: Storyboard; maxShiftS: number; starts_ms: number[] } | { error: string } {
  if (s.beats.length !== durationsMs.length) throw new Error('beats and durations differ in length');
  const raw = durationsMs.map(neededMs).reduce((a, b) => a + b, 0);
  if (raw > MAX_TOTAL_S * 1000) return { error: `seslendirme ${MAX_TOTAL_S} sn'yi aşıyor (${trNum(raw / 1000)} sn): storyboard'daki VO metni kısaltılmalı` };
  const { starts, beats: placed } = slotsFrom(s.beats.map((b) => b.id), retimedLengths(durationsMs, MIN_TOTAL_S * 1000));
  const durMs = toMs(placed.at(-1)!.t_end);
  const rehookAt = clamp(toMs(carry(s.rehook_at, s.beats, placed)), Math.ceil(0.4 * durMs + 1), Math.floor(0.6 * durMs - 1)) / 1000;
  const payoffAt = clamp(toMs(carry(s.payoff_at, s.beats, placed)), Math.ceil(0.7 * durMs + 1), durMs) / 1000;
  const storyboard: Storyboard = {
    ...s, duration_s: durMs / 1000, rehook_at: rehookAt, payoff_at: payoffAt,
    beats: s.beats.map((b, i) => ({ ...b, t_start: placed[i]!.t_start, t_end: placed[i]!.t_end })),
  };
  return { storyboard, maxShiftS: shiftOf(s.beats, placed), starts_ms: starts };
}

/**
 * H13: keep the beat times when every beat's needed length is within ±0.3 s of its current one, no line drifts more than 0.3 s from
 * (beat start + lead) once lines are pushed apart, and the last line ends inside the video; otherwise retime (maxShiftS: how far the beats would move).
 */
export function keepOrRetime(source: Storyboard, durationsMs: number[]): { keep: true; starts_ms: number[] } | { keep: false; maxShiftS: number } {
  if (source.beats.length !== durationsMs.length) throw new Error('beats and durations differ in length');
  const fits = source.beats.every((b, i) => Math.abs(neededMs(durationsMs[i]!) - (toMs(b.t_end) - toMs(b.t_start))) <= TOL);
  if (fits) {
    const p = placeLines(source.beats, durationsMs, { keep: true });
    const drift = p.starts_ms.every((st, i) => st - (toMs(source.beats[i]!.t_start) + LEAD) <= TOL);
    const lastEnd = p.starts_ms.at(-1)! + durationsMs.at(-1)!;
    if (drift && lastEnd <= toMs(source.duration_s)) return { keep: true, starts_ms: p.starts_ms };
  }
  const { beats } = slotsFrom(source.beats.map((b) => b.id), retimedLengths(durationsMs, MIN_TOTAL_S * 1000));
  return { keep: false, maxShiftS: shiftOf(source.beats, beats) };
}

// ---------------------------------------------------------------- captions and facts (H15)

export interface CaptionWord { text: string; start_ms: number; end_ms: number }
export interface CaptionPage { start_ms: number; end_ms: number; words: CaptionWord[] }
export const CAPTION_MIN_MS = 800;

const pageChars = (ws: CaptionWord[]) => ws.reduce((n, w) => n + w.text.length, 0) + Math.max(0, ws.length - 1);

/**
 * Pages of at most maxChars, broken where the gap between words exceeds maxGapMs. A page stays at least 0.8 s: a short page merges with the
 * neighbour across the smaller gap (at most 1 s) when the result still fits maxChars, else it stays up until the next page (or 0.8 s) begins.
 */
export function captionPages(words: CaptionWord[], o: { maxChars: number; maxGapMs: number } = { maxChars: 28, maxGapMs: 400 }): CaptionPage[] {
  const groups: CaptionWord[][] = [];
  for (const w of words) {
    const cur = groups.at(-1);
    const last = cur?.at(-1);
    if (cur && last && w.start_ms - last.end_ms <= o.maxGapMs && pageChars([...cur, w]) <= o.maxChars) cur.push(w);
    else groups.push([w]);
  }
  const span = (g: CaptionWord[]) => g.at(-1)!.end_ms - g[0]!.start_ms;
  for (;;) {
    let merged = false;
    for (let i = 0; i < groups.length && !merged; i++) {
      if (span(groups[i]!) >= CAPTION_MIN_MS) continue;
      const prev = groups[i - 1], next = groups[i + 1];
      const gp = prev ? groups[i]![0]!.start_ms - prev.at(-1)!.end_ms : Infinity;
      const gn = next ? next[0]!.start_ms - groups[i]!.at(-1)!.end_ms : Infinity;
      const options = [
        { at: i - 1, gap: gp, ok: !!prev && gp <= MERGE_MAX_GAP_MS && pageChars([...prev, ...groups[i]!]) <= o.maxChars },
        { at: i, gap: gn, ok: !!next && gn <= MERGE_MAX_GAP_MS && pageChars([...groups[i]!, ...next]) <= o.maxChars },
      ].filter((c) => c.ok).sort((a, b) => a.gap - b.gap);
      const pick = options[0];
      if (!pick) continue;
      groups.splice(pick.at, 2, [...groups[pick.at]!, ...groups[pick.at + 1]!]);
      merged = true;
    }
    if (!merged) break;
  }
  return groups.map((g, i) => {
    const start = g[0]!.start_ms;
    const nextStart = groups[i + 1]?.[0]!.start_ms ?? Infinity;
    return { start_ms: start, end_ms: Math.max(g.at(-1)!.end_ms, Math.min(start + CAPTION_MIN_MS, nextStart)), words: g };
  });
}

/** Turkish syllables = vowels (each syllable has exactly one). */
export function turkishSyllables(text: string): number {
  return (text.toLocaleLowerCase('tr').match(/[aeıioöuüâîû]/g) ?? []).length;
}

/** Measurements the reviewers see: first word, syllables per spoken second (line spans), worst CER. */
export function voFacts(lines: VoiceLine[], words: Pick<CaptionWord, 'start_ms'>[]): VoiceTrack['facts'] {
  const spoken = lines.reduce((n, l) => n + (l.end_ms - l.start_ms), 0) / 1000;
  const syllables = lines.reduce((n, l) => n + turkishSyllables(l.normalized_tr), 0);
  return {
    first_word_s: words.length ? Math.round(Math.min(...words.map((w) => w.start_ms))) / 1000 : 0,
    syllables_per_s: spoken > 0 ? Math.round((syllables / spoken) * 100) / 100 : 0,
    max_cer: Math.max(0, ...lines.map((l) => l.cer)),
  };
}
