import { describe, expect, it } from 'vitest';
import { guardText } from '../src/lib/format.ts';

describe('guardText', () => {
  it('names the blocking window, its use and when it opens', () => {
    expect(guardText({ blocked: true, reason: 'five_hour', resumeAt: '2026-10-06T14:00:00.000Z', fiveHour: 0.82, sevenDay: 0.1 })).toMatch(/^Yeni işler bekletiliyor: 5 sa %82, \d\d:\d\d'de açılır$/);
    expect(guardText({ blocked: true, reason: 'seven_day', resumeAt: null, fiveHour: 0.1, sevenDay: 0.93 })).toBe('Yeni işler bekletiliyor: 7 gün %93');
    expect(guardText({ blocked: true, reason: 'rejected', resumeAt: null, fiveHour: null, sevenDay: null })).toBe('Yeni işler bekletiliyor: kullanım limiti doldu');
  });
});
