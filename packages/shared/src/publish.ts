import { z } from 'zod';
import { licenseVerdict, type AssetKind } from './assets.ts';

/** Plan M6 T1: the publish contracts. A leaf module (values only from assets.ts); worker, API and web share it. */

export const PUBLICATION_STATUSES = ['queued', 'uploading', 'processing', 'sent', 'waiting', 'failed', 'published'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
/** Y6: one of these per video at a time (`waiting` too: TikTok's side is unknown). */
export const ACTIVE_PUBLICATION_STATUSES = ['queued', 'uploading', 'processing', 'waiting'] as const satisfies readonly PublicationStatus[];
/** Y6: rows that count toward the 24 h draft limit (plus `failed` rows that got a publish_id: a draft may exist on TikTok). */
export const LIMIT_COUNTED = ['queued', 'uploading', 'processing', 'sent', 'waiting', 'published'] as const satisfies readonly PublicationStatus[];
export const PUBLISH_VARIANTS = ['tiktok', 'music'] as const;
export type PublishVariant = (typeof PUBLISH_VARIANTS)[number];
export const PUBLISH_TARGETS = ['tiktok_draft'] as const;

export const DRAFT_LIMIT_24H = 5;
export const DAY_MS = 86_400_000;
export const POLL_INTERVAL_MS = 10_000;
export const POLL_FAST_WINDOW_MS = 300_000;
export const POLL_SLOW_INTERVAL_MS = 60_000;
export const WAIT_GIVE_UP_MS = DAY_MS;
export const MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024;
export const CAPTION_MAX = 2200;
export const DEFAULT_MAX_DURATION_S = 600;
export const MIN_DURATION_S = 3;

export const ChecklistSchema = z.record(z.string(), z.boolean());

export const PublicationSchema = z.object({
  id: z.string().uuid(),
  videoId: z.string().uuid(),
  versionId: z.string().uuid(),
  target: z.enum(PUBLISH_TARGETS),
  variant: z.enum(PUBLISH_VARIANTS),
  status: z.enum(PUBLICATION_STATUSES),
  blobSha: z.string(),
  bytes: z.number().int().nonnegative(),
  publishId: z.string().nullable(),
  failReason: z.string().nullable(),
  errorCode: z.string().nullable(),
  caption: z.string().max(CAPTION_MAX),
  aigcRequired: z.boolean(),
  checklist: ChecklistSchema.nullable(),
  url: z.string().nullable(),
  createdAt: z.coerce.date(),
  sentAt: z.coerce.date().nullable(),
  publishedAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date(),
});
export type Publication = z.infer<typeof PublicationSchema>;

const num1 = (n: number) => n.toFixed(1).replace('.', ',');

/** Y5: what TikTok accepts on the single-chunk inbox path. `p` comes from ffprobe or the stored artifact media; Turkish reasons. */
export function validateForTikTok(
  p: { container: string; vcodec: string; pixFmt: string; acodec: string | null; width: number; height: number; durationS: number; bytes: number },
  creator: { maxDurationS: number } | null,
): string[] {
  const out: string[] = [];
  if (!p.container.split(',').includes('mp4')) out.push('kapsayıcı MP4 olmalı');
  if (p.vcodec !== 'h264') out.push(`video kodeki h264 olmalı (${p.vcodec})`);
  if (p.pixFmt !== 'yuv420p' && p.pixFmt !== 'yuvj420p') out.push(`piksel biçimi yuv420p olmalı (${p.pixFmt})`);
  if (p.acodec !== 'aac') out.push(`ses kodeki AAC olmalı (${p.acodec ?? 'yok'})`);
  if (p.width !== 1080 || p.height !== 1920) out.push(`boyut 1080×1920 olmalı (${p.width}×${p.height})`);
  const max = creator?.maxDurationS ?? DEFAULT_MAX_DURATION_S;
  if (p.durationS < MIN_DURATION_S) out.push(`video en az ${MIN_DURATION_S} sn olmalı (${num1(p.durationS)} sn)`);
  else if (p.durationS > max) out.push(`video en çok ${max} sn olabilir (${num1(p.durationS)} sn)`);
  if (p.bytes > MAX_SINGLE_CHUNK_BYTES) out.push(`dosya 64 MB'ı aşıyor (${num1(p.bytes / 1024 / 1024)} MB); tek parça yükleme sınırı`);
  return out;
}

/** Y11: the product hashtag; Turkish letters kept (Turkish lower-casing), only letters and digits, at most 24 of them. */
export function productTag(name: string): string {
  const body = name.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');
  return body ? `#${[...body].slice(0, 24).join('')}` : '';
}

export const CHANNEL_HASHTAGS = ['#içindeneVar', '#nasılçalışır'] as const;

/** Y11: deterministic caption — hook, product line, 3–4 hashtags, attribution lines; at most 2200 characters (the hook is shortened). */
export function captionFor(i: { hookTr: string; productName: string; attributions: string[] }): string {
  const tags = [...CHANNEL_HASHTAGS, productTag(i.productName), '#mühendislik'].filter(Boolean).join(' ');
  const product = `${i.productName.trim()} içinde ne var? Parça parça açtık.`;
  const tail = [product, '', tags, ...(i.attributions.length ? ['', ...i.attributions] : [])].join('\n');
  const room = CAPTION_MAX - tail.length - 1;
  const hook = i.hookTr.trim();
  const head = hook.length <= room ? hook : `${hook.slice(0, Math.max(0, room - 1))}…`;
  return `${head}\n${tail}`.slice(0, CAPTION_MAX);
}

export interface SoundPlanLike { cues: { assetId: string }[]; music: { assetId: string } | null }
export interface AttributionAsset { id: string; title: string; licenseSpdx: string; attribution: string | null; own: boolean; allowed: boolean; kind?: AssetKind }

/** Y12: attribution lines from the assets that actually play in the variant; a revoked, unknown or attribution-less CC-BY asset is refused. */
export function attributionLines(plan: SoundPlanLike, assets: AttributionAsset[], variant: PublishVariant): { lines: string[]; refused: string[] } {
  const ids = [...plan.cues.map((c) => c.assetId), ...(variant === 'music' && plan.music ? [plan.music.assetId] : [])];
  const lines: string[] = [];
  const refused: string[] = [];
  for (const id of [...new Set(ids)]) {
    const a = assets.find((x) => x.id === id);
    if (!a) { refused.push(id); continue; }
    if (a.own) continue;
    if (!a.allowed || !licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: a.kind }).allowed) { refused.push(a.title); continue; }
    if (a.licenseSpdx === 'CC-BY-4.0') lines.push(a.attribution!.trim());
  }
  return { lines: [...new Set(lines)], refused };
}

/** Y11: the server re-appends any required attribution line the user removed from the caption. */
export function withAttributions(caption: string, lines: string[]): string {
  const missing = lines.filter((l) => !caption.includes(l));
  return missing.length ? [caption.trimEnd(), '', ...missing].join('\n') : caption;
}

export type ChecklistId = 'sound' | 'visibility' | 'aigc' | 'commercial';
export interface ChecklistItem { id: ChecklistId; label_tr: string; required: boolean }

/** Y13: the finish card checklist (spec §10). */
export function publishChecklist(i: { variant: PublishVariant; aigcRequired: boolean }): ChecklistItem[] {
  return [
    i.variant === 'tiktok'
      ? { id: 'sound', label_tr: 'Uygulamadan ses ekle', required: true }
      : { id: 'sound', label_tr: 'Uygulamadan ses ekle (isteğe bağlı: varyant müzikli)', required: false },
    { id: 'visibility', label_tr: 'Görünürlük: Herkes', required: true },
    i.aigcRequired
      ? { id: 'aigc', label_tr: "AI etiketini TikTok'ta açtım (klon ses)", required: true }
      : { id: 'aigc', label_tr: 'AI etiketi gerekmiyor: hazır TTS sesi ve Blender CG', required: false },
    { id: 'commercial', label_tr: 'Ticari içerik açıklaması: kapalı bırakın (marka iş birliği yok)', required: true },
  ];
}

/** Y13: null when the video may be marked published, otherwise the Turkish reason. */
export function canMarkPublished(items: ChecklistItem[], ticked: Record<string, boolean>, url: string): string | null {
  const missing = items.find((i) => i.required && !ticked[i.id]);
  if (missing) return `işaretlenmemiş zorunlu madde: ${missing.label_tr}`;
  if (!isTikTokVideoUrl(url)) return 'geçerli bir TikTok video bağlantısı girin';
  return null;
}

export function isTikTokVideoUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return false; }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  if (u.hostname === 'vm.tiktok.com') return /^\/[A-Za-z0-9]+\/?$/.test(u.pathname);
  if (u.hostname !== 'www.tiktok.com' && u.hostname !== 'tiktok.com') return false;
  return /^\/@[A-Za-z0-9._]+\/video\/\d+\/?$/.test(u.pathname);
}

export interface LimitRow { createdAt: Date; status: PublicationStatus; publishId: string | null }
export const countsTowardLimit = (r: Pick<LimitRow, 'status' | 'publishId'>) =>
  (LIMIT_COUNTED as readonly string[]).includes(r.status) || (r.status === 'failed' && r.publishId !== null);

/** Y6: null while a send is allowed; otherwise when the next one opens (24 h after the counted row that must age out). */
export function nextDraftSlot(rows: LimitRow[], now: Date): Date | null {
  const counted = rows.filter((r) => countsTowardLimit(r) && now.getTime() - r.createdAt.getTime() < DAY_MS).map((r) => r.createdAt.getTime()).sort((a, b) => a - b);
  if (counted.length < DRAFT_LIMIT_24H) return null;
  return new Date(counted[counted.length - DRAFT_LIMIT_24H]! + DAY_MS);
}

const ERRORS_TR: Record<string, string> = {
  spam_risk_too_many_pending_share: "TikTok'ta bekleyen taslak sınırı doldu (24 saatte 5). Gelen kutusundaki taslakları paylaşın ya da silin, sonra yeniden deneyin.",
  spam_risk_too_many_posts: 'Bu hesap bugün için paylaşım sınırına ulaştı. Yarın yeniden deneyin.',
  spam_risk_user_banned_from_posting: 'Bu hesabın paylaşım yapması TikTok tarafından engellenmiş.',
  rate_limit_exceeded: 'TikTok istek sınırı aşıldı (dakikada 6). Biraz bekleyip yeniden deneyin.',
  access_token_invalid: 'TikTok bağlantısının süresi dolmuş; yenilenemedi. Ayarlar → TikTok bağlantısı → Yeniden bağlan.',
  scope_not_authorized: 'TikTok bağlantısında gerekli izinler yok (video.upload). Ayarlar → TikTok bağlantısı → Yeniden bağlan.',
  unaudited_client_can_only_post_to_private_accounts: 'Onaysız uygulama herkese açık hesaba doğrudan paylaşamaz; taslak yolu kullanılmalı.',
  reached_active_user_cap: 'Onaysız uygulamanın günlük kullanıcı sınırı doldu. Yarın yeniden deneyin.',
  invalid_file_upload: 'TikTok yüklenen dosyayı kabul etmedi (dosya bozuk ya da eksik yüklendi).',
  file_format_check_failed: 'TikTok dosya biçimini kabul etmedi (MP4, H.264 + AAC gerekli).',
  duration_check_failed: 'TikTok video süresini kabul etmedi.',
  picture_size_check_failed: 'TikTok görüntü boyutunu kabul etmedi (1080×1920 gerekli).',
  reconnect_required: 'TikTok bağlantısının yenilenmesi gerekiyor: Ayarlar → TikTok bağlantısı → Yeniden bağlan.',
  not_connected: 'TikTok bağlı değil: Ayarlar → TikTok bağlantısı.',
  upload_failed: 'Video TikTok\'a yüklenemedi (yükleme adresi isteği reddetti).',
};
export const TIKTOK_ERROR_CODES = Object.keys(ERRORS_TR);

/** Y18: TikTok error codes in Turkish; an unknown code is kept with the log id. */
export function tiktokErrorTr(code: string, logId?: string | null): string {
  return ERRORS_TR[code] ?? `TikTok hatası: ${code}${logId ? ` (log kimliği ${logId})` : ''}`;
}
