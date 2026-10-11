import { describe, expect, it } from 'vitest';
import { LEGACY_VO_WINDOW } from '../src/voice.ts';
import {
  BRIEF_MAX, DEFAULT_DURATION, DURATION_HARD, durationWindowErrors, effectiveDuration, formatWindow, parseBriefDuration, recommendedWindow, voBounds, windowErrors,
} from '../src/production.ts';

describe('production brief and duration window (brief design Y1–Y3, Y9)', () => {
  it('defaults and hard bounds: 12–15 s by default (YAKLASIM), 10–60 s at most, a window at least 2 s wide', () => {
    expect(DEFAULT_DURATION).toEqual({ minS: 12, maxS: 15 });
    expect(DURATION_HARD).toEqual({ minS: 10, maxS: 60 });
    expect(BRIEF_MAX).toBe(2000);
    expect(durationWindowErrors({ minS: 20, maxS: 25 })).toEqual([]);
    expect(durationWindowErrors({ minS: 10, maxS: 60 })).toEqual([]);
    expect(durationWindowErrors({ minS: 8, maxS: 25 })[0]).toMatch(/10/);
    expect(durationWindowErrors({ minS: 20, maxS: 61 })[0]).toMatch(/60/);
    expect(durationWindowErrors({ minS: 25, maxS: 20 })[0]).toMatch(/en az/);
    expect(durationWindowErrors({ minS: 20, maxS: 21 })[0]).toMatch(/2 sn/);
    expect(formatWindow({ minS: 35, maxS: 55 })).toBe('35–55 sn');
  });

  it('parses the duration the brief states, deterministically; numbers without a time unit are ignored', () => {
    expect(parseBriefDuration('Kısa olsun, 20 sn civarı.')).toEqual({ minS: 18, maxS: 22 });
    expect(parseBriefDuration('20-25 saniye arası olsun')).toEqual({ minS: 20, maxS: 25 });
    expect(parseBriefDuration('20–25 sn')).toEqual({ minS: 20, maxS: 25 });
    expect(parseBriefDuration('en fazla 25 saniye')).toEqual({ minS: 18, maxS: 25 });
    expect(parseBriefDuration('25 saniyeyi geçmesin')).toEqual({ minS: 18, maxS: 25 });
    expect(parseBriefDuration('en az 40 sn')).toEqual({ minS: 40, maxS: 55 });
    expect(parseBriefDuration('1 dakika')).toEqual({ minS: 58, maxS: 60 });
    expect(parseBriefDuration('0,7 mm uca ve 3 parçaya odaklan')).toBeNull();
    expect(parseBriefDuration('kısa olsun')).toBeNull();
    expect(parseBriefDuration('')).toBeNull();
    // Clamped into the hard bounds, never rejected: the form shows what was understood.
    expect(parseBriefDuration('8 sn')).toEqual({ minS: 10, maxS: 12 });
    expect(parseBriefDuration('max 10-15 saniyelik olsun')).toEqual({ minS: 10, maxS: 15 }); // the user's own brief
    expect(parseBriefDuration('90 saniye')).toEqual({ minS: 58, maxS: 60 });
    // Review findings: Turkish words starting with s/dk are not units; the video length wins over per-scene timings (< 5 s) and
    // other durations (> 180 s); a unit may follow both ends of a range.
    for (const t of ['3 sütun olsun', '4 sıra', '2 sözcük', 'her sahne 2 sn', '2-3 sn geçişler', '5 dakikalık iş']) expect(parseBriefDuration(t), t).toBeNull();
    expect(parseBriefDuration('ilk 3 sn kanca olsun, toplam 40 sn')).toEqual({ minS: 38, maxS: 42 });
    expect(parseBriefDuration('2-3 sn geçişler, video 45 sn')).toEqual({ minS: 43, maxS: 47 });
    expect(parseBriefDuration('40 sn ile 50 sn')).toEqual({ minS: 40, maxS: 50 });
    expect(parseBriefDuration('40 sn - 50 sn')).toEqual({ minS: 40, maxS: 50 });
  });

  it('YAKLASIM fixes the window: neither the user nor the agent moves it; an agent window is still clamped and widened for the record', () => {
    expect(effectiveDuration({ user: { minS: 20, maxS: 25 }, agent: { minS: 40, maxS: 50 } })).toEqual({ window: DEFAULT_DURATION, source: 'default' });
    expect(effectiveDuration({ user: null, agent: { minS: 40, maxS: 50 } })).toEqual({ window: DEFAULT_DURATION, source: 'default' });
    expect(effectiveDuration({ user: null, agent: null })).toEqual({ window: DEFAULT_DURATION, source: 'default' });
    expect(recommendedWindow({ duration_min_s: 5, duration_max_s: 90 })).toEqual({ minS: 10, maxS: 60 });
    expect(recommendedWindow({ duration_min_s: 30, duration_max_s: 30 })).toEqual({ minS: 29, maxS: 31 });
    expect(recommendedWindow({ duration_min_s: 50, duration_max_s: 30 })).toEqual({ minS: 30, maxS: 50 });
  });

  it('VO bounds follow the window and equal the old 36/52 s on the legacy VO window', () => {
    expect(voBounds(LEGACY_VO_WINDOW)).toEqual({ minS: 36, maxS: 52 });
    expect(voBounds({ minS: 20, maxS: 25 })).toEqual({ minS: 19, maxS: 22 });
    expect(voBounds({ minS: 15, maxS: 17 })).toEqual({ minS: 11, maxS: 14 });
    expect(voBounds({ minS: 10, maxS: 12 })).toEqual({ minS: 6, maxS: 9 });
    expect(voBounds({ minS: 20, maxS: 22 })).toEqual({ minS: 16, maxS: 19 }); // never a single exact value
  });

  it('the storyboard check holds a duration to the video window', () => {
    expect(windowErrors(22, { minS: 20, maxS: 25 })).toEqual([]);
    expect(windowErrors(45, { minS: 20, maxS: 25 })).toEqual(['duration_s 45 sn: bu videonun süre penceresi 20–25 sn']);
  });
});
