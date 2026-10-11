import { describe, expect, it } from 'vitest';
import { summarizePlatforms } from '@videogen/shared/browser';
import { downloadHref, downloadName, filterHref, matchesFilter, parseFilter, PLATFORM_EN, saveMode, shareFailure, STATUS_EN } from '../src/lib/platform-view.ts';

const up = (versionId: string) => ({ action: 'uploaded' as const, versionId, uploadedAt: '2026-10-11T10:00:00.000Z', url: null });
const vid = (approach: 'yaklasim' | null, p: Parameters<typeof summarizePlatforms>[0]) => ({ approach, platforms: summarizePlatforms(p, 'v2') });
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

describe('platform view (video library L14, L19–L21)', () => {
  it('filters: approach chips and Not on X (an older version counts as not on X)', () => {
    const fresh = vid('yaklasim', { youtube: up('v2') });
    const old = vid(null, { youtube: up('v1'), instagram: up('v2') });
    expect(matchesFilter(fresh, 'all')).toBe(true);
    expect(matchesFilter(fresh, 'yaklasim')).toBe(true);
    expect(matchesFilter(old, 'yaklasim')).toBe(false);
    expect(matchesFilter(old, 'archive')).toBe(true);
    expect(matchesFilter(fresh, 'archive')).toBe(false);
    expect(matchesFilter(fresh, 'not-youtube')).toBe(false);
    expect(matchesFilter(old, 'not-youtube')).toBe(true);
    expect(matchesFilter(old, 'not-instagram')).toBe(false);
    expect(matchesFilter(fresh, 'not-tiktok')).toBe(true);
  });

  it('?f= round-trips and unknown values fall back to all', () => {
    expect(parseFilter('?f=not-instagram')).toBe('not-instagram');
    expect(parseFilter('?f=bogus')).toBe('all');
    expect(parseFilter('')).toBe('all');
    expect(filterHref('all')).toBe('/library');
    expect(filterHref('archive')).toBe('/library?f=archive');
  });

  it('download names pass the server rule', () => {
    expect(downloadName('Kablosuz kulaklık')).toBe('kablosuz-kulaklik.mp4');
    expect(downloadHref('ab'.repeat(32), 'Rubik küpü')).toBe(`/api/blobs/${'ab'.repeat(32)}?download=rubik-kupu.mp4`);
    expect(downloadName('İşlemci (CPU)')).toMatch(/^[a-z0-9][a-z0-9-]{0,79}\.mp4$/);
  });

  it('save mode: share only when the browser can share this file; a cancel is silent, other errors fall back to the download link', () => {
    const f = new File(['x'], 'x.mp4', { type: 'video/mp4' });
    expect(saveMode(undefined, f)).toBe('download');
    expect(saveMode({}, f)).toBe('download');
    expect(saveMode({ canShare: () => false }, f)).toBe('download');
    expect(saveMode({ canShare: () => true }, f)).toBe('share');
    expect(saveMode({ canShare: () => { throw new Error('nope'); } }, f)).toBe('download');
    expect(shareFailure(new DOMException('x', 'AbortError'))).toBe('cancelled');
    expect(shareFailure(new DOMException('x', 'NotAllowedError'))).toBe('fallback');
    expect(shareFailure(new Error('x'))).toBe('fallback');
  });

  it('labels are English', () => {
    for (const s of [...Object.values(PLATFORM_EN), ...Object.values(STATUS_EN)]) expect(s).not.toMatch(TURKISH);
  });
});
