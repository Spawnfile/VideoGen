import { describe, expect, it } from 'vitest';
import { publishChecklist, type Publication } from '@videogen/shared/browser';
import { publishView, tiktokView, type PublishInfo } from '../src/lib/publish-view.ts';

const NOW = new Date('2026-10-08T12:00:00Z');
const pub = (o: Partial<Publication>): Publication => ({
  id: '00000000-0000-4000-8000-000000000001', videoId: 'v', versionId: 'ver', target: 'tiktok_draft', variant: 'tiktok', status: 'queued', blobSha: 's', bytes: 1,
  publishId: null, failReason: null, errorCode: null, caption: 'c', aigcRequired: false, checklist: null, url: null,
  createdAt: NOW, sentAt: null, publishedAt: null, updatedAt: NOW, ...o,
});
const info = (o: Partial<PublishInfo> = {}): PublishInfo => ({
  eligible: true, blockers: [], variantBlockers: { tiktok: [], music: [] }, connected: true, username: 'whats.inside59',
  draftsUsed: 3, draftLimit: 5, nextSlot: null, aigcRequired: false, versionId: 'ver',
  variants: { tiktok: { sha: 'a', bytes: 1, durationS: 45 }, music: { sha: 'b', bytes: 1, durationS: 45 } },
  attributions: { tiktok: [], music: ['Müzik: X (CC BY 4.0)'] }, captions: { tiktok: 'Kanca', music: 'Kanca\n\nMüzik: X (CC BY 4.0)' },
  checklist: { tiktok: publishChecklist({ variant: 'tiktok', aigcRequired: false }), music: publishChecklist({ variant: 'music', aigcRequired: false }) },
  claims: [], publications: [], ...o,
});

describe('publish panel helpers (plan M6 T7)', () => {
  it('publishView: blockers in Turkish (not ready, no connection, 5/5 with the next slot, validation errors); stages from the live status; the \'sound\' item required only for the TikTok variant; \'aigc\' required when the finish says so', () => {
    const ok = publishView(info(), 'tiktok', NOW);
    expect(ok).toMatchObject({ canSend: true, blockers: [], draftsLabel: '3/5 taslak (24 saat)', stage: 'idle', caption: 'Kanca' });
    expect(ok.checklist.find((i) => i.id === 'sound')!.required).toBe(true);
    expect(publishView(info(), 'music', NOW).checklist.find((i) => i.id === 'sound')!.required).toBe(false);
    expect(publishView(info(), 'music', NOW).caption).toContain('Müzik: X (CC BY 4.0)');

    const full = publishView(info({ draftsUsed: 5, nextSlot: '2026-10-08T14:20:00Z' }), 'tiktok', NOW);
    expect(full.canSend).toBe(false);
    expect(full.draftsLabel).toBe('5/5 taslak (24 saat) · sonraki 17:20');
    expect(full.blockers).toEqual(['Son 24 saatte 5 taslak gönderildi; sonraki gönderim 17:20']);
    expect(publishView(info({ eligible: false, blockers: ["Yayın yalnızca 'Yayına hazır' videolar için.", 'TikTok bağlı değil: Ayarlar → TikTok bağlantısı.'] }), 'tiktok', NOW).blockers)
      .toEqual(["Yayın yalnızca 'Yayına hazır' videolar için.", 'TikTok bağlı değil: Ayarlar → TikTok bağlantısı.']);
    expect(publishView(info({ variantBlockers: { tiktok: ['video en çok 600 sn olabilir (601,0 sn)'], music: [] } }), 'tiktok', NOW)).toMatchObject({ canSend: false, blockers: ['video en çok 600 sn olabilir (601,0 sn)'] });
    expect(publishView(info({ variantBlockers: { tiktok: ['x'], music: [] } }), 'music', NOW).canSend).toBe(true);

    const stage = (p: Partial<Publication>) => publishView(info({ publications: [pub(p)] }), 'tiktok', NOW);
    expect(stage({ status: 'queued' })).toMatchObject({ stage: 'queued', stageLabel: 'Kuyrukta', canSend: false, canCancel: true });
    expect(stage({ status: 'uploading' })).toMatchObject({ stage: 'uploading', stageLabel: 'Yükleniyor', canSend: false, canCancel: false });
    expect(stage({ status: 'processing' }).stageLabel).toBe('TikTok işliyor');
    expect(stage({ status: 'waiting' }).stageLabel).toBe('TikTok yanıt vermedi; gelen kutunuzu kontrol edin (yoklama sürüyor)');
    expect(stage({ status: 'sent' })).toMatchObject({ stage: 'sent', stageLabel: 'Gelen kutusunda', showFinish: true, canSend: false });
    expect(stage({ status: 'failed', failReason: 'TikTok hatası: x' })).toMatchObject({ stage: 'failed', stageLabel: 'Gönderilemedi: TikTok hatası: x', canSend: true });
    expect(stage({ status: 'published', url: 'https://www.tiktok.com/@a/video/1' })).toMatchObject({ stage: 'published', stageLabel: 'Yayında', canSend: false, resend: true });

    const aigc = publishView(info({ aigcRequired: true, checklist: { tiktok: publishChecklist({ variant: 'tiktok', aigcRequired: true }), music: publishChecklist({ variant: 'music', aigcRequired: true }) } }), 'tiktok', NOW);
    expect(aigc.checklist.find((i) => i.id === 'aigc')).toMatchObject({ required: true });
    expect(aigc.aigcNote).toBe("Bu video klon ses içeriyor: TikTok'ta AI etiketini açmanız zorunlu.");
    expect(ok.aigcNote).toBeNull();
  });

  it('tiktokView: connected with the remaining validity, reconnect when the refresh token is dead, import hint without client credentials; no secret field is read', () => {
    const base = { connected: true, username: 'whats.inside59', expiresAt: '2026-10-09T11:00:00Z', refreshExpiresAt: '2027-10-08T12:00:00Z', scopes: ['user.info.basic', 'video.publish', 'video.upload'], clientConfigured: true };
    expect(tiktokView(base, NOW)).toEqual({ title: 'Bağlı: @whats.inside59', detail: 'Erişim belirteci 23 sa geçerli · izinler: user.info.basic, video.publish, video.upload', tone: 'ok', action: 'reconnect' });
    expect(tiktokView({ ...base, expiresAt: '2026-10-08T11:00:00Z' }, NOW).detail).toBe('Erişim belirteci gönderimde yenilenecek · izinler: user.info.basic, video.publish, video.upload');
    expect(tiktokView({ ...base, connected: false, refreshExpiresAt: '2026-10-01T00:00:00Z' }, NOW)).toEqual({ title: 'Bağlantı yenilenmeli', detail: 'TikTok izni sona erdi; yeniden bağlanın.', tone: 'warn', action: 'reconnect' });
    expect(tiktokView({ connected: false, username: null, expiresAt: null, refreshExpiresAt: null, scopes: [], clientConfigured: true }, NOW)).toEqual({ title: 'TikTok bağlı değil', detail: 'Bağlan düğmesiyle TikTok hesabınızı bağlayın.', tone: 'off', action: 'connect' });
    expect(tiktokView({ connected: false, username: null, expiresAt: null, refreshExpiresAt: null, scopes: [], clientConfigured: false }, NOW)).toEqual({ title: 'TikTok bağlı değil', detail: 'İstemci bilgisi yok: node bin/tiktok.mjs import', tone: 'off', action: 'import' });
    const seen: string[] = [];
    const spy = new Proxy({ ...base }, { get: (o, k) => { seen.push(String(k)); return (o as Record<string, unknown>)[k as string]; } });
    tiktokView(spy, NOW);
    expect(seen.every((k) => ['connected', 'username', 'expiresAt', 'refreshExpiresAt', 'scopes', 'clientConfigured'].includes(k))).toBe(true);
  });
});
