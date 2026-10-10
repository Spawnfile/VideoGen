import { describe, expect, it } from 'vitest';
import { barSeconds, MusicScoreSchema, musicScoreErrors, type MusicScore } from '../src/music.ts';

export const score = (o: Partial<MusicScore> = {}): MusicScore => ({
  version: 1,
  bpm: 96,
  key: { root: 'A', mode: 'minor' },
  duration_s: 45,
  intent_tr: 'Sakin, merak uyandıran bir teknoloji altlığı; ödülde yükselir.',
  sections: [
    { id: 'giris', t_start: 0, t_end: 15, chords: ['Am', 'F', 'C', 'G'], energy: 0.3, layers: [{ instrument: 'pad', pattern: 'swell', level: 0.6 }, { instrument: 'bell', pattern: 'accents', level: 0.4 }] },
    { id: 'orta', t_start: 15, t_end: 32, chords: ['Am', 'F', 'C', 'G'], energy: 0.55, layers: [{ instrument: 'pad', pattern: 'sustain', level: 0.5 }, { instrument: 'bass', pattern: 'pulse', level: 0.6 }, { instrument: 'arp', pattern: 'up', level: 0.45 }] },
    { id: 'odul', t_start: 32, t_end: 45, chords: ['F', 'G', 'Am', 'Am'], energy: 0.8, layers: [{ instrument: 'pad', pattern: 'sustain', level: 0.55 }, { instrument: 'bass', pattern: 'root', level: 0.6 }, { instrument: 'drums', pattern: 'pulse', level: 0.5 }] },
  ],
  accents: [{ t: 0, kind: 'hit' }, { t: 21, kind: 'riser' }, { t: 32, kind: 'drop' }],
  ...o,
});

describe('MusicScore (agent music design A1)', () => {
  it('accepts a contiguous score that ends at duration_s; a bar is 4 beats', () => {
    expect(MusicScoreSchema.safeParse(score()).success).toBe(true);
    expect(musicScoreErrors(score(), { durationS: 45 })).toEqual([]);
    expect(barSeconds(120)).toBe(2);
  });

  it('rejects gaps, a wrong end, bad chords, duplicate layers and accents outside the video', () => {
    const s = score();
    const gap = { ...s, sections: [s.sections[0]!, { ...s.sections[1]!, t_start: 16 }, s.sections[2]!] };
    expect(musicScoreErrors(gap, { durationS: 45 })).toContain('bölümler boşluksuz ve bitişik olmalı (orta 16 sn başlıyor, önceki 15 sn bitiyor)');
    expect(musicScoreErrors(s, { durationS: 40 })).toContain('müzik süresi 45 sn: video 40 sn');
    expect(MusicScoreSchema.safeParse({ ...s, sections: [{ ...s.sections[0]!, chords: ['H7'] }, ...s.sections.slice(1)] }).success).toBe(false);
    const dup = { ...s, sections: [{ ...s.sections[0]!, layers: [s.sections[0]!.layers[0]!, s.sections[0]!.layers[0]!] }, ...s.sections.slice(1)] };
    expect(MusicScoreSchema.safeParse(dup).success).toBe(false);
    expect(musicScoreErrors({ ...s, accents: [{ t: 50, kind: 'hit' }] }, { durationS: 45 })).toContain('vurgu 50 sn videonun dışında');
    expect(MusicScoreSchema.safeParse({ ...s, bpm: 200 }).success).toBe(false);
  });
});
