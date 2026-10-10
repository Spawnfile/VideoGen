import { describe, expect, it } from 'vitest';
import { durationBadge, recommendationLine, initialDurationState, onBriefChange, onDurationEdit, onDurationMode, producePayload } from '../src/lib/brief-view.ts';

describe('Studio brief and duration form (brief design Y1–Y3)', () => {
  it('starts on Otomatik with the default shown; a duration in the brief fills the manual window as "yönergeden"', () => {
    const s0 = initialDurationState();
    expect(s0).toEqual({ mode: 'auto', minS: 35, maxS: 55, origin: 'default' });
    expect(durationBadge(s0)).toBe('Otomatik · ajan önerir, yoksa varsayılan 35–55 sn');
    const s1 = onBriefChange(s0, 'Kısa olsun, 20 saniyeyi geçmesin.');
    expect(s1).toEqual({ mode: 'manual', minS: 15, maxS: 20, origin: 'brief' });
    expect(durationBadge(s1)).toBe('15–20 sn · yönergeden');
    // the brief loses its duration: back to Otomatik
    expect(onBriefChange(s1, 'Kısa olsun.')).toEqual(s0);
  });

  it('the user\'s own edit wins over the brief: once edited, the brief no longer moves the window', () => {
    const s1 = onBriefChange(initialDurationState(), '20 sn');
    const s2 = onDurationEdit(s1, { minS: 22 });
    expect(s2).toEqual({ mode: 'manual', minS: 22, maxS: 22, origin: 'user' });
    expect(onBriefChange(s2, '40 sn')).toBe(s2);
    expect(durationBadge(onDurationEdit(s2, { maxS: 26 }))).toBe('22–26 sn · senin kararın');
    // switching to Elle by hand starts from the default values as the user's decision
    expect(onDurationMode(initialDurationState(), 'manual')).toEqual({ mode: 'manual', minS: 35, maxS: 55, origin: 'user' });
    expect(onDurationMode(s2, 'auto')).toEqual(initialDurationState());
  });

  it('the payload carries the brief and the window only when the user set one; an invalid window is an error in Turkish', () => {
    expect(producePayload({ name: ' kalem ', mode: 'silent', brief: '  ', duration: initialDurationState() })).toEqual({ ok: true, body: { productName: 'kalem', audioMode: 'silent' } });
    expect(producePayload({ name: 'kalem', mode: 'vo', brief: ' Yaya odaklan. ', duration: { mode: 'manual', minS: 20, maxS: 25, origin: 'user' } })).toEqual({
      ok: true, body: { productName: 'kalem', audioMode: 'vo', brief: 'Yaya odaklan.', duration: { minS: 20, maxS: 25 } },
    });
    expect(producePayload({ name: 'kalem', mode: 'vo', brief: '', duration: { mode: 'manual', minS: 22, maxS: 22, origin: 'user' } })).toEqual({ ok: false, error: 'süre aralığı en az 2 sn geniş olmalı' });
  });

  it('the research card says whether the agent\'s window was applied or overridden by the user', () => {
    const rec = { duration_min_s: 40, duration_max_s: 50 };
    expect(recommendationLine(rec)).toBe('Ajanın süre önerisi: 40–50 sn');
    expect(recommendationLine(rec, { duration: { minS: 40, maxS: 50 }, durationSource: 'agent' })).toBe('Ajanın süre önerisi: 40–50 sn · uygulandı');
    expect(recommendationLine(rec, { duration: { minS: 20, maxS: 25 }, durationSource: 'user' })).toBe('Ajanın süre önerisi: 40–50 sn · uygulanmadı, senin kararın 20–25 sn geçerli');
  });
});
