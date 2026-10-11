import { describe, expect, it } from 'vitest';
import type { VideoStatus } from '@videogen/shared/browser';
import { coverOf, lengthOf, posterTint, videoLabel } from '../src/lib/poster.ts';

describe('posterTint', () => {
  it('is stable for the same name and ignores case and outer spaces', () => {
    expect(posterTint('Rubik küpü')).toEqual(posterTint('  rubik KÜPÜ '));
    expect(posterTint('Ruj').tone).toBe(posterTint('Ruj').tone);
  });

  it('spreads 40 sample product names over at least 6 tones', () => {
    const names = ['Ruj', 'Kalem', 'Çakmak', 'Termos', 'Fermuar', 'Ataş', 'Rubik küpü', 'Saat', 'Klavye', 'Kulaklık', 'Enigma', 'Asma kilit', 'Pilot kalem', 'PS5 kol', 'CPU', 'Makas', 'Zımba', 'Silgi', 'Pergel', 'Cetvel',
      'Fön makinesi', 'Tost makinesi', 'Çaydanlık', 'Ütü', 'Mikser', 'Blender', 'Fener', 'Pusula', 'Dürbün', 'Mikroskop', 'Teleskop', 'Gözlük', 'Şemsiye', 'Kilit', 'Anahtar', 'Musluk', 'Vida', 'Somun', 'Yay', 'Mıknatıs'];
    expect(new Set(names.map((n) => posterTint(n).tone)).size).toBeGreaterThanOrEqual(6);
  });

  it('uses Turkish upper case for the initial (ı → I, i → İ)', () => {
    expect(posterTint('ıhlamur').initial).toBe('I');
    expect(posterTint('ilaç').initial).toBe('İ');
    expect(posterTint('çakmak').initial).toBe('Ç');
  });

  it('gives a dot for an empty name', () => {
    expect(posterTint('   ').initial).toBe('·');
  });
});

describe('cover and length', () => {
  const draft = { videoSha: 'dv', coverSha: 'dc', durationS: 20 };
  const final = { musicSha: 'fm', tiktokSha: null, coverSha: 'fc', durationS: 31 };

  it('prefers the final cover, then the draft cover', () => {
    expect(coverOf({ final, draft })).toBe('fc');
    expect(coverOf({ final: null, draft })).toBe('dc');
    expect(coverOf({ final: { ...final, coverSha: null }, draft })).toBe('dc');
  });

  it('falls back to tint when no sha (null)', () => {
    expect(coverOf({ final: null, draft: null })).toBeNull();
    expect(coverOf({ final: null, draft: { ...draft, coverSha: null } })).toBeNull();
  });

  it('takes the final length, then the draft length', () => {
    expect(lengthOf({ final, draft })).toBe(31);
    expect(lengthOf({ final: null, draft })).toBe(20);
    expect(lengthOf({ final: null, draft: null })).toBeNull();
  });
});

describe('videoLabel', () => {
  it('covers every VideoStatus', () => {
    const table: [VideoStatus, string, string][] = [
      ['queued', 'QUEUED', 'muted'], ['needs_human', 'NEEDS YOU', 'needs'], ['ready', 'READY', 'ok'], ['published', 'POSTED', 'ok'],
      ['failed', 'FAILED', 'error'], ['cancelled', 'STOPPED', 'dim'],
    ];
    for (const [status, text, tone] of table) expect(videoLabel({ status }, null), status).toEqual({ text, tone });
  });

  it('shows the run percent rounded for a running video', () => {
    expect(videoLabel({ status: 'running' }, { progress: 61.6, status: 'running' })).toEqual({ text: '62%', tone: 'live' });
  });

  it('says RUNNING without a run', () => {
    expect(videoLabel({ status: 'running' }, null)).toEqual({ text: 'RUNNING', tone: 'live' });
  });
});
