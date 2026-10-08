import type { ChecklistItem, Publication, PublicationStatus, PublishVariant } from '@videogen/shared/browser';

/** GET /api/videos/:id/publish (plan M6 T6). */
export interface PublishInfo {
  eligible: boolean; blockers: string[]; variantBlockers: Record<PublishVariant, string[]>; connected: boolean; username: string | null;
  draftsUsed: number; draftLimit: number; nextSlot: string | null; aigcRequired: boolean; versionId: string | null;
  variants: Record<PublishVariant, { sha: string; bytes: number; durationS: number | null } | null>;
  attributions: Record<PublishVariant, string[]>; captions: Record<PublishVariant, string>; checklist: Record<PublishVariant, ChecklistItem[]>;
  claims: { id: string; text_tr: string; sources: unknown }[];
  publications: Publication[];
}
/** GET /api/tiktok. */
export interface TikTokStatus { connected: boolean; username: string | null; expiresAt: string | null; refreshExpiresAt: string | null; scopes: string[]; clientConfigured: boolean }

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' });

const STAGE: Record<PublicationStatus, string> = {
  queued: 'Kuyrukta', uploading: 'Yükleniyor', processing: 'TikTok işliyor', waiting: 'TikTok yanıt vermedi; gelen kutunuzu kontrol edin (yoklama sürüyor)',
  sent: 'Gelen kutusunda', failed: 'Gönderilemedi', published: 'Yayında',
};
const ACTIVE: PublicationStatus[] = ['queued', 'uploading', 'processing', 'waiting'];

export interface PublishViewModel {
  canSend: boolean; canCancel: boolean; blockers: string[]; draftsLabel: string; stage: 'idle' | PublicationStatus; stageLabel: string;
  showFinish: boolean; resend: boolean; latest: Publication | null; checklist: ChecklistItem[]; caption: string; aigcNote: string | null;
}

/** The Yayın panel (plan Y22): what blocks a send, the live stage of the latest send, the variant's checklist and caption. */
export function publishView(info: PublishInfo, variant: PublishVariant, now = new Date()): PublishViewModel {
  const latest = info.publications[0] ?? null;
  const stage = latest?.status ?? 'idle';
  const limit = info.nextSlot && new Date(info.nextSlot) > now ? `Son 24 saatte ${info.draftLimit} taslak gönderildi; sonraki gönderim ${hhmm(info.nextSlot)}` : null;
  const blockers = [...info.blockers, ...(info.variantBlockers[variant] ?? []), ...(limit ? [limit] : [])];
  const busy = !!latest && ACTIVE.includes(latest.status);
  const done = !!latest && (latest.status === 'sent' || latest.status === 'published') && latest.versionId === info.versionId && latest.variant === variant;
  return {
    canSend: blockers.length === 0 && !busy && !done,
    canCancel: latest?.status === 'queued',
    blockers,
    draftsLabel: `${info.draftsUsed}/${info.draftLimit} taslak (24 saat)${info.nextSlot ? ` · sonraki ${hhmm(info.nextSlot)}` : ''}`,
    stage,
    stageLabel: !latest ? '' : latest.status === 'failed' ? `${STAGE.failed}: ${latest.failReason ?? 'bilinmeyen hata'}` : STAGE[latest.status],
    showFinish: latest?.status === 'sent',
    resend: done,
    latest,
    checklist: info.checklist[variant] ?? [],
    caption: info.captions[variant] ?? '',
    aigcNote: info.aigcRequired ? "Bu video klon ses içeriyor: TikTok'ta AI etiketini açmanız zorunlu." : null,
  };
}

/** Ayarlar → TikTok bağlantısı (plan Y22): reads only the status fields; the API never sends a token. */
export function tiktokView(s: TikTokStatus, now = new Date()): { title: string; detail: string; tone: 'ok' | 'warn' | 'off'; action: 'connect' | 'reconnect' | 'import' } {
  if (!s.clientConfigured) return { title: 'TikTok bağlı değil', detail: 'İstemci bilgisi yok: node bin/tiktok.mjs import', tone: 'off', action: 'import' };
  if (!s.connected) {
    return s.refreshExpiresAt
      ? { title: 'Bağlantı yenilenmeli', detail: 'TikTok izni sona erdi; yeniden bağlanın.', tone: 'warn', action: 'reconnect' }
      : { title: 'TikTok bağlı değil', detail: 'Bağlan düğmesiyle TikTok hesabınızı bağlayın.', tone: 'off', action: 'connect' };
  }
  const hours = s.expiresAt ? Math.floor((new Date(s.expiresAt).getTime() - now.getTime()) / 3_600_000) : 0;
  const validity = hours > 0 ? `Erişim belirteci ${hours} sa geçerli` : 'Erişim belirteci gönderimde yenilenecek';
  return { title: `Bağlı: @${s.username ?? '?'}`, detail: `${validity} · izinler: ${s.scopes.join(', ')}`, tone: 'ok', action: 'reconnect' };
}
