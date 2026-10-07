import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outputJsonSchema, StoryboardSchema, validateArtifact, type Storyboard } from '../src/artifacts.ts';
import {
  aigcRequired, AudioPlanSchema, captionPages, DEFAULT_NARRATOR, estimateVoS, g4Gate, keepOrRetime, NarratorVoiceSchema, placeLines, retimeStoryboard, storyboardVoErrors,
  turkishSyllables, voFacts, VoiceTrackSchema, voTextErrors, type CaptionWord, type VoiceTrack,
} from '../src/voice.ts';

const fx = <T>(name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8')) as T;
const track = () => fx<VoiceTrack>('voice-track-kalem');
/** The kalem storyboard as a voice-over video: each beat's vo_text comes from the voice-track fixture. */
const voBoard = (): Storyboard => {
  const s = fx<Storyboard>('storyboard-kalem');
  const lines = track().lines;
  return { ...s, audio_mode: 'vo', beats: s.beats.map((b, i) => ({ ...b, vo_text: { tr: lines[i]!.text_tr } })) };
};
const lens = (s: Storyboard) => s.beats.map((b) => Math.round((b.t_end - b.t_start) * 1000));
/** Line durations that need exactly the beat's current length (lead 0.10 + line + gap 0.18). */
const exact = (s: Storyboard) => lens(s).map((l) => l - 280);
const text = (n: number) => 'ab '.repeat(n).slice(0, n).trim();
const word = (text: string, start_ms: number, end_ms: number): CaptionWord => ({ text, start_ms, end_ms });

describe('voice contracts', () => {
  it('AudioPlan: fixtures pass; an unknown sfx name or an out-of-range gain fail; VoiceTrack: lines in beat order without overlap, words inside their line and monotone', () => {
    const vo = fx<Record<string, unknown>>('audio-plan-vo');
    const silent = fx<Record<string, unknown>>('audio-plan-silent');
    expect(AudioPlanSchema.safeParse(vo).success).toBe(true);
    expect(AudioPlanSchema.safeParse(silent).success).toBe(true);
    expect(validateArtifact('AudioPlan', vo).ok).toBe(true);
    expect(JSON.stringify(outputJsonSchema('AudioPlan'))).not.toContain('propertyNames');
    const sfx = (exclude: string[]) => ({ ...vo, sfx: { gain_offset_db: 0, exclude } });
    expect(AudioPlanSchema.safeParse(sfx(['whoosh', 'thud'])).success).toBe(true);
    expect(AudioPlanSchema.safeParse(sfx(['boom'])).success).toBe(false);
    expect(AudioPlanSchema.safeParse(sfx(['click', 'click'])).success).toBe(false);
    expect(AudioPlanSchema.safeParse({ ...vo, music: { asset_id: null, gain_db: -5 } }).success).toBe(false);
    expect(AudioPlanSchema.safeParse({ ...vo, vo_gain_db: 7 }).success).toBe(false);
    expect(AudioPlanSchema.safeParse({ ...vo, duck_db: 5 }).success).toBe(false);
    expect(AudioPlanSchema.safeParse({ ...vo, version: 0 }).success).toBe(false);
    expect(AudioPlanSchema.safeParse({ ...vo, music: { asset_id: 'not-a-uuid', gain_db: -18 } }).success).toBe(false);

    const t = track();
    expect(VoiceTrackSchema.safeParse(t).success).toBe(true);
    expect(voFacts(t.lines, t.words)).toEqual(t.facts); // the fixture's facts are the measured ones
    const overlap = { ...t, lines: t.lines.map((l, i) => (i === 1 ? { ...l, start_ms: t.lines[0]!.end_ms - 50 } : l)) };
    expect(VoiceTrackSchema.safeParse(overlap).success).toBe(false);
    const outside = { ...t, words: t.words.map((w, i) => (i === 3 ? { ...w, end_ms: w.end_ms + 5000 } : w)) };
    expect(VoiceTrackSchema.safeParse(outside).success).toBe(false);
    const swapped = { ...t, words: [t.words[1]!, t.words[0]!, ...t.words.slice(2)] };
    expect(VoiceTrackSchema.safeParse(swapped).success).toBe(false);
    expect(VoiceTrackSchema.safeParse({ ...t, words: [...t.words, { text: 'x', start_ms: 0, end_ms: 10, beat_id: 'yok' }] }).success).toBe(false);
  });

  it('NarratorVoice: the default is the provisional Chatterbox preset; a Freya clone is rejected; aigcRequired only for a clone; g4Gate truth table', () => {
    expect(DEFAULT_NARRATOR).toEqual({ engine: 'chatterbox', voice: { kind: 'preset', id: 'hazir' } });
    expect(NarratorVoiceSchema.safeParse(DEFAULT_NARRATOR).success).toBe(true);
    expect(NarratorVoiceSchema.safeParse({ engine: 'freya', voice: { kind: 'preset', id: 'leyla' } }).success).toBe(true);
    const asset_id = '5b0e2c9a-3d1f-4c7e-8a64-2f9b1d7e4a10';
    expect(NarratorVoiceSchema.safeParse({ engine: 'chatterbox', voice: { kind: 'clone', asset_id } }).success).toBe(true);
    expect(NarratorVoiceSchema.safeParse({ engine: 'freya', voice: { kind: 'clone', asset_id } }).success).toBe(false);
    expect(NarratorVoiceSchema.safeParse({ engine: 'freya', voice: { kind: 'preset', id: 'hazir' } }).success).toBe(false);
    expect(aigcRequired(DEFAULT_NARRATOR)).toBe(false);
    expect(aigcRequired({ engine: 'chatterbox', voice: { kind: 'clone', asset_id } })).toBe(true);

    const base = track();
    const withProvider = (voice: VoiceTrack['provider']['voice'], aigc_label: boolean): VoiceTrack => ({ ...base, provider: { ...base.provider, voice, aigc_label } });
    const clone = { kind: 'clone', asset_id } as const;
    expect(g4Gate({ audioMode: 'silent', track: null, refPermitted: false })).toBe(true);
    expect(g4Gate({ audioMode: 'vo', track: null, refPermitted: true })).toBe(false);
    expect(g4Gate({ audioMode: 'vo', track: base, refPermitted: false })).toBe(true); // preset
    expect(g4Gate({ audioMode: 'vo', track: withProvider(clone, true), refPermitted: true })).toBe(true);
    expect(g4Gate({ audioMode: 'vo', track: withProvider(clone, true), refPermitted: false })).toBe(false);
    expect(g4Gate({ audioMode: 'vo', track: withProvider(clone, false), refPermitted: true })).toBe(false);
  });

  it("voTextErrors and the length estimate: emoji, '@', 'x2', a storyboard over 52 s or under 36 s are reported; '0,7 mm', '%50', '₺15' pass", () => {
    expect(voTextErrors("Bilye 0,7 mm çapında, %50 daha dayanıklı ve ₺15'e mal olur. Şaşırtıcı, değil mi?")).toEqual([]);
    expect(voTextErrors('Şaşırtıcı değil mi'.normalize('NFD'))).toEqual([]); // decomposed ş / ğ (NFC first)
    expect(voTextErrors('Harika 😀')).toHaveLength(1);
    expect(voTextErrors('a — b … c / d')).toHaveLength(1); // the H6 allow-list is deliberately strict
    expect(voTextErrors('yaz@kalem')).toHaveLength(1);
    expect(voTextErrors('bir x2 kalem')).toHaveLength(1);
    expect(voTextErrors('3D yazıcı')).toHaveLength(1);

    const withChars = (total: number): Storyboard => {
      const s = voBoard();
      const per = Math.ceil(total / s.beats.length);
      return { ...s, beats: s.beats.map((b) => ({ ...b, vo_text: { tr: text(per) } })) };
    };
    expect(estimateVoS(withChars(602))).toBeCloseTo(602 / 14 + 7 * 0.28, 6);
    expect(storyboardVoErrors(withChars(602))).toEqual([]);
    expect(storyboardVoErrors(withChars(800))).toEqual(['seslendirme tahmini 59,5 sn: en çok 52 sn olmalı; VO metnini kısaltın']);
    expect(storyboardVoErrors(withChars(300))).toEqual(['seslendirme tahmini 23,5 sn: en az 36 sn olmalı; VO metnini uzatın']);
    expect(storyboardVoErrors(withChars(300), { minS: false })).toEqual([]); // the fixer's check has no lower bound
    expect(storyboardVoErrors(withChars(800), { minS: false })).toHaveLength(1);
    // the 52 s boundary: 7 × 100 chars = 51.96 s passes, 7 × 101 = 52.03 s does not (withChars rounds up per beat)
    expect(storyboardVoErrors(withChars(700))).toEqual([]);
    expect(storyboardVoErrors(withChars(701))).toHaveLength(1);
    const bad = withChars(602);
    bad.beats[2]!.vo_text = { tr: 'x2 😀' };
    expect(storyboardVoErrors(bad).filter((e) => e.startsWith('beats.2.vo_text:'))).toHaveLength(2);
    expect(storyboardVoErrors(fx<Storyboard>('storyboard-kalem'))).toEqual([]); // silent: nothing to check
  });

  it('placeLines + retimeStoryboard: a first pass retimes the beats to the VO (lead 0,10 s, gap 0,18 s, min beat 1,2 s), pads to 35 s, refuses over 55 s; rehook and payoff move with their beat and stay valid; StoryboardSchema still holds', () => {
    const three = [{ id: 'a', t_start: 0, t_end: 3 }, { id: 'b', t_start: 3, t_end: 6 }, { id: 'c', t_start: 6, t_end: 9 }];
    expect(placeLines(three, [2000, 500, 3000], { keep: false })).toEqual({
      starts_ms: [100, 2380, 3580],
      beats: [{ id: 'a', t_start: 0, t_end: 2.28 }, { id: 'b', t_start: 2.28, t_end: 3.48 }, { id: 'c', t_start: 3.48, t_end: 6.76 }],
      overflowS: [0, 0, 0],
    });
    expect(placeLines(three, [3500, 500, 500], { keep: true }).overflowS).toEqual([0.6, 0, 0]);
    expect(placeLines(three, [3500, 500, 500], { keep: true }).starts_ms).toEqual([100, 3720, 6100]);

    // 7 lines of 3 s: 7 × 3.28 s = 22.96 s, padded to 35 s as equal gaps (the beats need the same length)
    const s = voBoard();
    const padded = retimeStoryboard(s, Array(7).fill(3000));
    if ('error' in padded) throw new Error(padded.error);
    expect(padded.storyboard.duration_s).toBe(35);
    expect(padded.storyboard.beats.map((b) => b.t_start)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(padded.starts_ms).toEqual([100, 5100, 10_100, 15_100, 20_100, 25_100, 30_100]);
    expect(padded.maxShiftS).toBe(10);
    expect(padded.storyboard.rehook_at).toBe(18.75); // 22 s was 75 % into beat 4 (16–24 s); now 15–20 s
    expect(padded.storyboard.payoff_at).toBe(26.25); // 34 s was 25 % into beat 6 (32–40 s); now 25–30 s
    expect(StoryboardSchema.safeParse(padded.storyboard).success).toBe(true);
    expect(s.beats[0]!.t_end).toBe(3); // the source is not mutated

    // lines that already fill 35–55 s: lead + line + gap per beat, no padding
    const tight = retimeStoryboard(s, Array(7).fill(5000));
    if ('error' in tight) throw new Error(tight.error);
    expect(tight.storyboard.duration_s).toBeCloseTo(36.96, 6);
    expect(tight.starts_ms[0]).toBe(100);
    expect(StoryboardSchema.safeParse(tight.storyboard).success).toBe(true);

    // rehook and payoff are clamped into their ranges when their beat moves a long way
    for (const d of [[500, 500, 500, 500, 500, 500, 9000], [9000, 500, 500, 500, 500, 500, 500], [500, 9000, 500, 500, 500, 500, 500]]) {
      const r = retimeStoryboard(s, d);
      if ('error' in r) throw new Error(r.error);
      const D = r.storyboard.duration_s;
      expect(D).toBeGreaterThanOrEqual(35);
      expect(r.storyboard.rehook_at).toBeGreaterThanOrEqual(0.4 * D);
      expect(r.storyboard.rehook_at).toBeLessThanOrEqual(0.6 * D);
      expect(r.storyboard.payoff_at).toBeGreaterThanOrEqual(0.7 * D);
      expect(StoryboardSchema.safeParse(r.storyboard).success).toBe(true);
    }
    // a minimum beat is 1.2 s even for a one-word line
    const minimum = retimeStoryboard(s, [100, 100, 100, 100, 100, 100, 9000]);
    if ('error' in minimum) throw new Error(minimum.error);
    expect(minimum.storyboard.beats.slice(0, 6).every((b) => b.t_end - b.t_start >= 1.2 - 1e-9)).toBe(true);

    // padding never gives a beat a negative share: 7 ms of padding over 14 beats
    const many: Storyboard = { ...s, beats: Array.from({ length: 14 }, (_, i) => ({ ...s.beats[0]!, id: `m${i}`, t_start: i * 2.5, t_end: (i + 1) * 2.5 })), duration_s: 35, rehook_at: 15, payoff_at: 30 };
    const lines14 = [...Array(13).fill(2220), 2213];
    const tiny = retimeStoryboard(many, lines14);
    if ('error' in tiny) throw new Error(tiny.error);
    expect(tiny.storyboard.duration_s).toBe(35);
    tiny.storyboard.beats.forEach((b, i) => expect(Math.round((b.t_end - b.t_start) * 1000)).toBeGreaterThanOrEqual(lines14[i]! + 280));
    // uneven padding is proportional to the beats' needed lengths (within 1 ms)
    const uneven = [2000, 4000, 2000, 4000, 2000, 4000, 2000];
    const un = retimeStoryboard(s, uneven);
    if ('error' in un) throw new Error(un.error);
    const need = uneven.map((d) => d + 280);
    const sum = need.reduce((a, b) => a + b, 0);
    un.storyboard.beats.forEach((b, i) => expect(Math.abs((Math.round((b.t_end - b.t_start) * 1000) - need[i]!) - ((35_000 - sum) * need[i]!) / sum)).toBeLessThan(1));
    expect(un.storyboard.duration_s).toBe(35);

    // 55 000 ms is allowed, 55 001 ms is refused
    const at55 = [7577, 7577, 7577, 7577, 7577, 7577, 7578];
    const ok55 = retimeStoryboard(s, at55);
    expect('error' in ok55).toBe(false);
    if (!('error' in ok55)) expect(ok55.storyboard.duration_s).toBe(55);
    expect(retimeStoryboard(s, [...at55.slice(0, 6), 7579])).toHaveProperty('error');

    expect(retimeStoryboard(s, [8000, 8000, 8000, 8000, 8000, 8000, 8240])).toEqual({ error: "seslendirme 55 sn'yi aşıyor (58,2 sn): storyboard'daki VO metni kısaltılmalı" });
  });

  it('keepOrRetime: every beat whose needed length is within ±0,3 s of its current length keeps the times; one beat 0,31 s longer or shorter retimes', () => {
    const s = voBoard();
    const base = exact(s);
    const starts = s.beats.map((b) => Math.round(b.t_start * 1000) + 100);
    expect(keepOrRetime(s, base)).toEqual({ keep: true, starts_ms: starts });
    const bump = (i: number, by: number) => base.map((d, k) => (k === i ? d + by : d));
    expect(keepOrRetime(s, bump(2, 300)).keep).toBe(true);
    expect(keepOrRetime(s, bump(2, -300)).keep).toBe(true);
    expect(keepOrRetime(s, bump(2, 310))).toEqual({ keep: false, maxShiftS: expect.any(Number) });
    expect(keepOrRetime(s, bump(2, -310)).keep).toBe(false);
    expect(keepOrRetime(s, bump(0, 310)).keep).toBe(false);

    // each beat is within tolerance, but the pushes add up: three in a row drift the fourth line by 0.42 s
    const three = base.map((d, k) => (k < 3 ? d + 300 : d));
    expect(keepOrRetime(s, three).keep).toBe(false);
    // two in a row keep, and the lines never overlap: at least 0.12 s apart
    const two = base.map((d, k) => (k < 2 ? d + 300 : d));
    const kept = keepOrRetime(s, two);
    if (!kept.keep) throw new Error('two pushes must keep');
    two.forEach((d, i) => { if (i > 0) expect(kept.starts_ms[i]! - (kept.starts_ms[i - 1]! + two[i - 1]!)).toBeGreaterThanOrEqual(120); });
    expect(kept.starts_ms[1]).toBe(3240); // pushed from 3100 to line 1 end 3120 + 0.12 s
    // cumulative drift of exactly 0.30 s keeps, 0.31 s retimes (pushes of +20, +20, −100 / −90 ms against the beat lengths)
    const drift = (last: number) => lens(s).map((l, k) => l + [20, 20, last, -280, -280, -280, -280][k]!);
    expect(keepOrRetime(s, drift(-100)).keep).toBe(true);
    expect(keepOrRetime(s, drift(-90)).keep).toBe(false);
    // beat times with float noise (4.1, 10.7, …) behave like exact milliseconds
    const edges = [0, 4.1, 10.7, 17.3, 25.1, 33.7, 41.9, 45];
    const noisy: Storyboard = { ...s, beats: s.beats.map((b, i) => ({ ...b, t_start: edges[i]!, t_end: edges[i + 1]! })) };
    const noisyBase = lens(noisy).map((l) => l - 280);
    expect(keepOrRetime(noisy, noisyBase)).toEqual({ keep: true, starts_ms: edges.slice(0, 7).map((e) => Math.round(e * 1000) + 100) });
    expect(keepOrRetime(noisy, noisyBase.map((d, k) => (k === 1 ? d + 300 : d))).keep).toBe(true);
    expect(keepOrRetime(noisy, noisyBase.map((d, k) => (k === 1 ? d + 310 : d))).keep).toBe(false);
    // the last line may not run past duration_s
    expect(keepOrRetime(s, bump(6, 300)).keep).toBe(false);
    // the retime figure is how far the beats would move
    const far = keepOrRetime(s, bump(2, 2000));
    if (far.keep) throw new Error('2 s longer must retime');
    expect(far.maxShiftS).toBeGreaterThan(1);
  });

  it('captionPages and voFacts: pages ≤ 28 chars broken at gaps over 400 ms; first word time; Turkish syllables per second (ünlü sayısı)', () => {
    const gapPages = captionPages([word('Bilye', 0, 300), word('dönerken', 350, 800), word('mürekkebi', 1300, 1800), word('taşır', 1850, 2400)]);
    expect(gapPages.map((p) => p.words.map((w) => w.text))).toEqual([['Bilye', 'dönerken'], ['mürekkebi', 'taşır']]);
    expect(gapPages[1]).toMatchObject({ start_ms: 1300, end_ms: 2400 });
    // no break at exactly 400 ms
    expect(captionPages([word('a', 0, 500), word('b', 900, 1500)])).toHaveLength(1);

    const long = Array.from({ length: 10 }, (_, i) => word('abcdef', i * 350, i * 350 + 300));
    const pages = captionPages(long);
    expect(pages.map((p) => p.words.length)).toEqual([4, 4, 2]);
    for (const p of pages) expect(p.words.map((w) => w.text).join(' ').length).toBeLessThanOrEqual(28);
    expect(pages.every((p) => p.end_ms - p.start_ms >= 800)).toBe(true); // the short last page stays up 0.8 s

    // exactly 28 chars (spaces included) is one page, 29 splits
    const fit = (lens: number[]) => captionPages(lens.map((n, i) => word('a'.repeat(n), i * 350, i * 350 + 300)));
    expect(fit([6, 6, 6, 7])).toHaveLength(1);
    expect(fit([6, 6, 6, 8]).map((p) => p.words.length)).toEqual([3, 1]);
    // a short page merges with the neighbour across the smaller gap when it is at most 1 s (H15: 0.8 s wins over the break)
    const merged = captionPages([word('Evet', 0, 200), word('kalem', 700, 1100), word('yazar', 1150, 1700)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ start_ms: 0, end_ms: 1700 });
    // over a gap of more than 1 s there is no merge: the short page stays up until 0.8 s
    const far = captionPages([word('Evet', 0, 200), word('kalem', 1700, 2600)]);
    expect(far.map((p) => [p.start_ms, p.end_ms])).toEqual([[0, 800], [1700, 2600]]);
    // a short page whose neighbour does not fit is cut off when the next page starts
    const cut = captionPages([word('Evet', 0, 200), word('a'.repeat(24), 650, 1700)]);
    expect(cut.map((p) => [p.start_ms, p.end_ms])).toEqual([[0, 650], [650, 1700]]);
    expect(captionPages([])).toEqual([]);

    expect(turkishSyllables('kalem yazar')).toBe(4);
    expect(turkishSyllables('IŞIK İNCİ')).toBe(4); // ı-ı, i-i
    expect(turkishSyllables('kâğıt hâlâ îman Ûlü ÂÎ')).toBe(10);
    const t = track();
    const facts = voFacts(
      [{ ...t.lines[0]!, normalized_tr: 'kalem yazar', start_ms: 100, end_ms: 1100, cer: 0.02 }, { ...t.lines[1]!, normalized_tr: 'kalem yazar', start_ms: 3100, end_ms: 4100, cer: 0.04 }],
      [word('kalem', 100, 500), word('yazar', 600, 1100)],
    );
    expect(facts).toEqual({ first_word_s: 0.1, syllables_per_s: 4, max_cer: 0.04 });
    expect(voFacts([], [])).toEqual({ first_word_s: 0, syllables_per_s: 0, max_cer: 0 });
  });
});
