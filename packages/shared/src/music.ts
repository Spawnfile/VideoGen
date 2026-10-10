import { z } from 'zod';
import { DURATION_HARD } from './production.ts';

/**
 * Agent music design A1: the composer writes a symbolic score, rendered by python/audio_service music_cli (FluidSynth, FluidR3 GM).
 * Times are seconds on the video's timeline; chords are one per 4/4 bar and repeat across their section.
 */
export const MUSIC_INSTRUMENTS = ['pad', 'bass', 'arp', 'pluck', 'bell', 'drums'] as const;
export type MusicInstrument = (typeof MUSIC_INSTRUMENTS)[number];
/** What each instrument can play (the renderer's generators; the composer picks, it does not write notes for these). */
export const MUSIC_PATTERNS: Record<MusicInstrument, readonly string[]> = {
  pad: ['sustain', 'swell'],
  bass: ['root', 'pulse', 'octave'],
  arp: ['up', 'down', 'updown'],
  pluck: ['offbeat', 'eighths'],
  bell: ['accents', 'sparse'],
  drums: ['light', 'pulse', 'four', 'half'],
};
export const MUSIC_MODES = ['major', 'minor'] as const;
export const NOTE_ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'] as const;
export const ACCENT_KINDS = ['hit', 'riser', 'drop'] as const;
/** A chord symbol the renderer voices: root, optional accidental, optional quality. */
export const CHORD_RE = /^[A-G](#|b)?(m|maj7|m7|7|sus2|sus4|dim|add9)?$/;

const tr = (max: number) => z.string().trim().min(1).max(max);
const LayerSchema = z.object({
  instrument: z.enum(MUSIC_INSTRUMENTS),
  pattern: z.string(),
  level: z.number().min(0).max(1),
}).refine((l) => MUSIC_PATTERNS[l.instrument].includes(l.pattern), { message: 'bu enstrümanın deseni değil' });
const SectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,24}$/),
  t_start: z.number().min(0),
  t_end: z.number().positive(),
  chords: z.array(z.string().regex(CHORD_RE, 'akor: kök (A–G), isteğe bağlı #/b ve m, maj7, m7, 7, sus2, sus4, dim, add9')).min(1).max(16),
  energy: z.number().min(0).max(1),
  layers: z.array(LayerSchema).min(1).max(6).refine((ls) => new Set(ls.map((l) => l.instrument)).size === ls.length, { message: 'bir enstrüman bir bölümde bir kez' }),
});
const MotifSchema = z.object({
  instrument: z.enum(['bell', 'pluck', 'arp']),
  /** Repeats every `every_bars` bars from the section start where its section allows (beats are quarter notes within the motif). */
  notes: z.array(z.object({ beat: z.number().min(0).max(16), pitch: z.string().regex(/^[A-G](#|b)?[2-6]$/), len_beats: z.number().min(0.125).max(8) })).min(1).max(32),
  every_bars: z.number().int().min(1).max(8),
  sections: z.array(z.string()).min(1).max(8),
  level: z.number().min(0).max(1),
});

export const MusicScoreSchema = z.object({
  version: z.number().int().min(1),
  bpm: z.number().int().min(60).max(160),
  key: z.object({ root: z.enum(NOTE_ROOTS), mode: z.enum(MUSIC_MODES) }),
  duration_s: z.number().min(DURATION_HARD.minS).max(DURATION_HARD.maxS),
  intent_tr: tr(300),
  sections: z.array(SectionSchema).min(1).max(8),
  accents: z.array(z.object({ t: z.number().min(0), kind: z.enum(ACCENT_KINDS) })).max(8),
  motif: MotifSchema.optional(),
});
export type MusicScore = z.infer<typeof MusicScoreSchema>;

export const barSeconds = (bpm: number) => (4 * 60) / bpm;
const EPS = 0.01;

/** Cross-checks the schema cannot express: the timeline, the video's length, accents and the motif's sections. */
export function musicScoreErrors(s: MusicScore, o: { durationS: number }): string[] {
  const out: string[] = [];
  if (Math.abs(s.duration_s - o.durationS) > 0.05) out.push(`müzik süresi ${s.duration_s} sn: video ${o.durationS} sn`);
  if (Math.abs((s.sections[0]?.t_start ?? 0)) > EPS) out.push('ilk bölüm 0 sn\'de başlamalı');
  s.sections.forEach((sec, i) => {
    if (sec.t_end <= sec.t_start) out.push(`bölüm ${sec.id}: bitiş başlangıçtan sonra olmalı`);
    const prev = s.sections[i - 1];
    if (prev && Math.abs(sec.t_start - prev.t_end) > EPS) out.push(`bölümler boşluksuz ve bitişik olmalı (${sec.id} ${sec.t_start} sn başlıyor, önceki ${prev.t_end} sn bitiyor)`);
  });
  const last = s.sections.at(-1);
  if (last && Math.abs(last.t_end - s.duration_s) > EPS) out.push(`son bölüm duration_s (${s.duration_s}) anında bitmeli`);
  if (new Set(s.sections.map((x) => x.id)).size !== s.sections.length) out.push('bölüm kimlikleri tekrar ediyor');
  for (const a of s.accents) if (a.t > s.duration_s) out.push(`vurgu ${a.t} sn videonun dışında`);
  for (const id of s.motif?.sections ?? []) if (!s.sections.some((x) => x.id === id)) out.push(`motif bölümü yok: ${id}`);
  return out;
}

/** What a generated track is called in the UI and in the sound plan (own work: no attribution, spec §9 license gate passes). */
export const GENERATED_MUSIC_TITLE = 'Özgün müzik (besteci ajan)';
