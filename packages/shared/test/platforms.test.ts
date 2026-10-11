import { describe, expect, it } from 'vitest';
import { fileSlug, summarizePlatforms, youtubeTitleFrom } from '../src/index.ts';

const up = (versionId: string, at = '2026-10-11T10:00:00.000Z') => ({ action: 'uploaded' as const, versionId, uploadedAt: at, url: null });

describe('platform rules (spec L14, L19, L12)', () => {
  it('summarizePlatforms: none without events, uploaded on the best version, outdated on an older one, none after a retract; platforms independent', () => {
    expect(summarizePlatforms({}, 'v1')).toEqual({
      youtube: { status: 'none', uploadedAt: null, url: null, versionId: null },
      instagram: { status: 'none', uploadedAt: null, url: null, versionId: null },
      tiktok: { status: 'none', uploadedAt: null, url: null, versionId: null },
    });
    const s = summarizePlatforms({ youtube: up('v1'), instagram: up('v0'), tiktok: { ...up('v1'), action: 'retracted' } }, 'v1');
    expect(s.youtube).toEqual({ status: 'uploaded', uploadedAt: '2026-10-11T10:00:00.000Z', url: null, versionId: 'v1' });
    expect(s.instagram.status).toBe('outdated');
    expect(s.tiktok.status).toBe('none');
    expect(summarizePlatforms({ youtube: up('v1') }, null).youtube.status).toBe('uploaded');
  });

  it('fileSlug transliterates Turkish, lowercases, dashes the rest, caps at 60 and falls back to video', () => {
    expect(fileSlug('Kulaklık')).toBe('kulaklik');
    expect(fileSlug('PS5 Kol')).toBe('ps5-kol');
    expect(fileSlug('İğne & Çuvaldız')).toBe('igne-cuvaldiz');
    expect(fileSlug("Rubik's cube")).toBe('rubik-s-cube');
    expect(fileSlug('!!!')).toBe('video');
    expect(fileSlug('a'.repeat(80))).toHaveLength(60);
    expect(fileSlug('-x-')).toBe('x');
  });

  it('youtubeTitleFrom keeps the first sentence without hashtags or emoji, cut at a word boundary within 100', () => {
    expect(youtubeTitleFrom("How a Rubik's cube actually holds itself together. No glue, no magnets.\n\n#rubikscube"))
      .toBe("How a Rubik's cube actually holds itself together.");
    expect(youtubeTitleFrom("What's inside a Rubik's cube? 🤯 No glue")).toBe("What's inside a Rubik's cube?");
    const long = youtubeTitleFrom(`${'word '.repeat(40)}end.`)!;
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith(' ')).toBe(false);
    expect(youtubeTitleFrom('#only #tags')).toBeNull();
    expect(youtubeTitleFrom('   ')).toBeNull();
  });
});
