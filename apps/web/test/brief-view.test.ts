import { describe, expect, it } from 'vitest';
import { BRIEF_DEFAULTS, producePayload, recommendationLine, YAKLASIM_LINE } from '../src/lib/brief-view.ts';

describe('Studio form under YAKLASIM (spec Y1, Y2, Y7)', () => {
  it('the payload carries the product and the brief only: no voiceover choice, no length', () => {
    expect(producePayload({ name: ' kalem ', brief: '  ' })).toEqual({ ok: true, body: { productName: 'kalem' } });
    expect(producePayload({ name: 'kalem', brief: ' Yaya odaklan. ' })).toEqual({ ok: true, body: { productName: 'kalem', brief: 'Yaya odaklan.' } });
  });

  it('the form states the fixed approach and what a brief can and cannot change', () => {
    expect(YAKLASIM_LINE).toBe('YAKLASIM · 12–15 s · no voiceover · English on-screen text');
    expect(BRIEF_DEFAULTS).toContain('cannot change the approach');
    expect(BRIEF_DEFAULTS).not.toMatch(/[çğıöşüÇĞİÖŞÜ]/);
  });

  it('the research card keeps the agent\'s length suggestion as information only', () => {
    expect(recommendationLine({ duration_min_s: 12, duration_max_s: 15 })).toBe('Agent suggests 12–15 s · YAKLASIM length is fixed at 12–15 s');
  });
});
