import { fileSlug, PLATFORMS, type Platform, type PlatformStatus, type VideoView } from '@videogen/shared/browser';
import { blobUrl } from './api.ts';

/** Video library L14, L19–L21: labels, library filters, download names and the save-to-phone choice. */
export const PLATFORM_EN: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };
export const PLATFORM_SHORT: Record<Platform, string> = { youtube: 'YT', instagram: 'IG', tiktok: 'TT' };
export const STATUS_EN: Record<PlatformStatus, string> = { none: 'Not uploaded', uploaded: 'Uploaded', outdated: 'Older version uploaded' };

export type LibraryFilter = 'all' | 'yaklasim' | 'archive' | 'not-youtube' | 'not-instagram' | 'not-tiktok';
export const LIBRARY_FILTERS: [LibraryFilter, string][] = [
  ['all', 'All'], ['yaklasim', 'YAKLASIM'], ['archive', 'Archive'],
  ['not-youtube', 'Not on YouTube'], ['not-instagram', 'Not on Instagram'], ['not-tiktok', 'Not on TikTok'],
];
const IDS = new Set<string>(LIBRARY_FILTERS.map(([id]) => id));

export function parseFilter(search: string): LibraryFilter {
  const f = new URLSearchParams(search).get('f');
  return f && IDS.has(f) ? (f as LibraryFilter) : 'all';
}
export const filterHref = (f: LibraryFilter): string => (f === 'all' ? '/library' : `/library?f=${f}`);

/** L21: "Not on X" means nothing current is there — never uploaded, undone, or only an older version. */
export function matchesFilter(v: Pick<VideoView, 'approach' | 'platforms'>, f: LibraryFilter): boolean {
  if (f === 'all') return true;
  if (f === 'yaklasim') return v.approach === 'yaklasim';
  if (f === 'archive') return v.approach !== 'yaklasim';
  const p = f.slice('not-'.length) as Platform;
  return PLATFORMS.includes(p) && v.platforms[p].status !== 'uploaded';
}

export const downloadName = (productName: string): string => `${fileSlug(productName)}.mp4`;
export const downloadHref = (sha: string, productName: string): string => `${blobUrl(sha)}?download=${downloadName(productName)}`;

export type SaveMode = 'share' | 'download';
/** L20: Web Share with files (iPhone → "Save Video") when the browser says it can share this file; else a plain download. */
export function saveMode(nav: { canShare?: (d: { files: File[] }) => boolean } | undefined, probe: File): SaveMode {
  try { return nav?.canShare?.({ files: [probe] }) ? 'share' : 'download'; } catch { return 'download'; }
}
/** The user closing the share sheet is not an error; anything else falls back to the download link. */
export const shareFailure = (err: unknown): 'cancelled' | 'fallback' => ((err as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'fallback');

const pad = (n: number) => String(n).padStart(2, '0');
/** The datetime-local value for "now" in the device's time zone, to the minute (the mark sheet's default). */
export const localNowInput = (now = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
/** A datetime-local value as an ISO instant; an empty or invalid value is an inline error (the field can be cleared). */
export function markTimeIso(value: string): { ok: true; iso: string } | { ok: false; error: string } {
  const t = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(t) ? { ok: false, error: 'Pick when it was uploaded.' } : { ok: true, iso: new Date(t).toISOString() };
}
