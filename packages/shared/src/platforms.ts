/**
 * Video library (spec 2026-10-11, L12–L19): uploads are done by hand in the platform apps; VideoGen keeps an append-only log of marks and
 * undos and derives each platform's state from it.
 */
export const PLATFORMS = ['youtube', 'instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_ACTIONS = ['uploaded', 'retracted'] as const;
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];
export type PlatformStatus = 'none' | 'uploaded' | 'outdated';
export interface PlatformState { status: PlatformStatus; uploadedAt: string | null; url: string | null; versionId: string | null }
export type PlatformSummary = Record<Platform, PlatformState>;
export interface PlatformLatest { action: PlatformAction; versionId: string; uploadedAt: string; url: string | null }
export interface PlatformEvent { id: number; platform: Platform; action: PlatformAction; versionId: string; uploadedAt: string; url: string | null; note: string | null; createdAt: string }
export type VideoOrigin = 'pipeline' | 'import';
export type VideoApproach = 'yaklasim';

/** Spec L16: the narrowest platform limit wins (Instagram caption 2200, YouTube title 100). */
export const CAPTION_MAX = 2200;
export const YOUTUBE_TITLE_MAX = 100;
export const PLATFORM_URL_MAX = 500;
export const PLATFORM_NOTE_MAX = 500;
export const FUTURE_SLACK_MS = 300_000;

const NONE: PlatformState = { status: 'none', uploadedAt: null, url: null, versionId: null };

/** Spec L14: the newest event per platform decides; an upload of a version other than the best one is outdated. */
export function summarizePlatforms(latest: Partial<Record<Platform, PlatformLatest>>, bestVersionId: string | null): PlatformSummary {
  const one = (p: Platform): PlatformState => {
    const e = latest[p];
    if (!e || e.action !== 'uploaded') return { ...NONE };
    const status = bestVersionId && e.versionId !== bestVersionId ? 'outdated' : 'uploaded';
    return { status, uploadedAt: e.uploadedAt, url: e.url, versionId: e.versionId };
  };
  return { youtube: one('youtube'), instagram: one('instagram'), tiktok: one('tiktok') };
}

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u' };

/** Spec L19: a download-safe file name stem (the blob route accepts ^[a-z0-9][a-z0-9-]{0,79}\.mp4$). */
export function fileSlug(name: string): string {
  const ascii = [...name].map((ch) => TR[ch] ?? ch).join('').toLowerCase();
  const s = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'video';
}

/** Spec L12: the caption's first sentence, hashtags and emoji removed, at most 100 characters cut at a word boundary. */
export function youtubeTitleFrom(caption: string): string | null {
  const clean = caption.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const m = clean.match(/^.*?[.!?](?=\s|$)/);
  let t = (m ? m[0] : clean).trim();
  if (t.length > YOUTUBE_TITLE_MAX) {
    const cut = t.slice(0, YOUTUBE_TITLE_MAX + 1);
    const sp = cut.lastIndexOf(' ');
    t = cut.slice(0, sp > 0 ? sp : YOUTUBE_TITLE_MAX).trimEnd();
  }
  return t || null;
}
