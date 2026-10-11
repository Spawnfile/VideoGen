import { describe, expect, it } from 'vitest';
import { durationWindowErrors } from '@videogen/shared/browser';
import { durationBadge, recommendationLine, initialDurationState, onBriefChange, onDurationEdit, onDurationMode, producePayload, windowError } from '../src/lib/brief-view.ts';

describe('Studio brief and duration form (brief design Y1–Y3)', () => {
  it('starts on Otomatik with the default shown; a duration in the brief fills the manual window as "yönergeden"', () => {
    const s0 = initialDurationState();
    expect(s0).toEqual({ mode: 'auto', minS: 35, maxS: 55, origin: 'default' });
    expect(durationBadge(s0)).toBe('Auto · the agent suggests, else the default 35–55 s');
    const s1 = onBriefChange(s0, 'Kısa olsun, 20 saniyeyi geçmesin.');
    expect(s1).toEqual({ mode: 'manual', minS: 14, maxS: 20, origin: 'brief' }); // "en fazla 20" → 70 % of it as the floor
    expect(durationBadge(s1)).toBe('14–20 s · from the brief');
    // the brief loses its duration: back to Otomatik
    expect(onBriefChange(s1, 'Kısa olsun.')).toEqual(s0);
  });

  it('the user\'s own edit wins over the brief: once edited, the brief no longer moves the window', () => {
    const s1 = onBriefChange(initialDurationState(), '20 sn');
    const s2 = onDurationEdit(s1, { minS: 22 });
    expect(s2).toEqual({ mode: 'manual', minS: 22, maxS: 22, origin: 'user' });
    expect(onBriefChange(s2, '40 sn')).toBe(s2);
    expect(durationBadge(onDurationEdit(s2, { maxS: 26 }))).toBe('22–26 s · your choice');
    // switching to Elle by hand starts from the default values as the user's decision
    expect(onDurationMode(initialDurationState(), 'manual')).toEqual({ mode: 'manual', minS: 35, maxS: 55, origin: 'user' });
    expect(onDurationMode(s2, 'auto')).toEqual(initialDurationState());
  });

  it('the payload carries the brief and the window only when the user set one; an invalid window is an error in Turkish', () => {
    expect(producePayload({ name: ' kalem ', mode: 'silent', brief: '  ', duration: initialDurationState() })).toEqual({ ok: true, body: { productName: 'kalem', audioMode: 'silent' } });
    expect(producePayload({ name: 'kalem', mode: 'vo', brief: ' Yaya odaklan. ', duration: { mode: 'manual', minS: 20, maxS: 25, origin: 'user' } })).toEqual({
      ok: true, body: { productName: 'kalem', audioMode: 'vo', brief: 'Yaya odaklan.', duration: { minS: 20, maxS: 25 } },
    });
    expect(producePayload({ name: 'kalem', mode: 'vo', brief: '', duration: { mode: 'manual', minS: 22, maxS: 22, origin: 'user' } })).toEqual({ ok: false, error: 'The length window must be at least 2 s wide.' });
  });

  it('the research card says whether the agent\'s window was applied or overridden by the user', () => {
    const rec = { duration_min_s: 40, duration_max_s: 50 };
    expect(recommendationLine(rec)).toBe('Agent suggests 40–50 s');
    expect(recommendationLine(rec, { duration: { minS: 40, maxS: 50 }, durationSource: 'agent' })).toBe('Agent suggests 40–50 s · applied');
    expect(recommendationLine(rec, { duration: { minS: 20, maxS: 25 }, durationSource: 'user' })).toBe('Agent suggests 40–50 s · not applied, your choice of 20–25 s stands');
  });

  it('windowError agrees with the shared durationWindowErrors', () => {
    for (const w of [{ minS: 30, maxS: 45 }, { minS: 5, maxS: 20 }, { minS: 30, maxS: 70 }, { minS: 40, maxS: 30 }, { minS: 22, maxS: 23 }, { minS: Number.NaN, maxS: 20 }]) {
      expect(windowError(w) === null, JSON.stringify(w)).toBe(durationWindowErrors(w).length === 0);
    }
  });
});
