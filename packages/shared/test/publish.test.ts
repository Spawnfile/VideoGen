import { describe, expect, it } from 'vitest';
import {
  attributionLines, canMarkPublished, captionFor, DRAFT_LIMIT_24H, isTikTokVideoUrl, MAX_SINGLE_CHUNK_BYTES, nextDraftSlot, productTag,
  publishChecklist, TIKTOK_ERROR_CODES, tiktokErrorTr, validateForTikTok,
} from '../src/index.ts';

const pen = { container: 'mov,mp4,m4a,3gp,3g2,mj2', vcodec: 'h264', pixFmt: 'yuv420p', acodec: 'aac', width: 1080, height: 1920, durationS: 45.0, bytes: 24 * 1024 * 1024 };

describe('publish contracts (plan M6 T1)', () => {
  it('validateForTikTok: the pen final passes; wrong codec, pixel format, size, a 2 s or 601 s clip and a 65 MiB file are each reported in Turkish; the creator\'s max duration wins over 600 s', () => {
    expect(validateForTikTok(pen, null)).toEqual([]);
    expect(validateForTikTok({ ...pen, vcodec: 'hevc' }, null)).toEqual(['video kodeki h264 olmalı (hevc)']);
    expect(validateForTikTok({ ...pen, pixFmt: 'yuv444p' }, null)).toEqual(['piksel biçimi yuv420p olmalı (yuv444p)']);
    expect(validateForTikTok({ ...pen, acodec: 'opus' }, null)).toEqual(['ses kodeki AAC olmalı (opus)']);
    expect(validateForTikTok({ ...pen, container: 'matroska,webm' }, null)).toEqual(['kapsayıcı MP4 olmalı']);
    expect(validateForTikTok({ ...pen, width: 720, height: 1280 }, null)).toEqual(['boyut 1080×1920 olmalı (720×1280)']);
    expect(validateForTikTok({ ...pen, durationS: 2 }, null)).toEqual(['video en az 3 sn olmalı (2,0 sn)']);
    expect(validateForTikTok({ ...pen, durationS: 601 }, null)).toEqual(['video en çok 600 sn olabilir (601,0 sn)']);
    expect(validateForTikTok({ ...pen, bytes: 65 * 1024 * 1024 }, null)).toEqual(['dosya 64 MB\'ı aşıyor (65,0 MB); tek parça yükleme sınırı']);
    expect(MAX_SINGLE_CHUNK_BYTES).toBe(64 * 1024 * 1024);
    expect(validateForTikTok({ ...pen, durationS: 61 }, { maxDurationS: 60 })).toEqual(['video en çok 60 sn olabilir (61,0 sn)']);
    expect(validateForTikTok({ ...pen, durationS: 700 }, { maxDurationS: 900 })).toEqual([]);
  });

  it('captionFor and productTag: hook first, product line, 3–4 hashtags with Turkish letters kept, attributions last, at most 2200 chars; an empty product tag is dropped', () => {
    expect(productTag('Tükenmez kalem')).toBe('#tükenmezkalem');
    expect(productTag('USB-C şarj kablosu (2 m)')).toBe('#usbcşarjkablosu2m');
    expect(productTag('Çok uzun bir ürün adı ki etiket sınırını aşar')).toBe('#çokuzunbirürünadıkietike');
    expect(productTag('!!!')).toBe('');
    const c = captionFor({ hookTr: 'Bu kalemin içinde 7 parça var', productName: 'Tükenmez kalem', attributions: ['Ses efekti: Ada Yazar (CC BY 4.0)'] });
    const lines = c.split('\n');
    expect(lines[0]).toBe('Bu kalemin içinde 7 parça var');
    expect(lines[1]).toBe('Tükenmez kalem içinde ne var? Parça parça açtık.');
    const tags = lines.find((l) => l.startsWith('#'))!.split(' ');
    expect(tags).toEqual(['#içindeneVar', '#nasılçalışır', '#tükenmezkalem', '#mühendislik']);
    expect(lines.at(-1)).toBe('Ses efekti: Ada Yazar (CC BY 4.0)');
    const noTag = captionFor({ hookTr: 'Kanca', productName: '!!!', attributions: [] }).split('\n').find((l) => l.startsWith('#'))!;
    expect(noTag.split(' ')).toHaveLength(3);
    const long = captionFor({ hookTr: 'x'.repeat(3000), productName: 'Kalem', attributions: ['Atıf (CC BY 4.0)'] });
    expect(long.length).toBeLessThanOrEqual(2200);
    expect(long.endsWith('Atıf (CC BY 4.0)')).toBe(true);
  });

  it('attributionLines: the TikTok variant lists only imported CC-BY SFX; the music variant adds the music\'s attribution; CC0, Pixabay and the library\'s own SFX give no line; a revoked or attribution-less CC-BY asset is refused', () => {
    const assets = [
      { id: 'own', title: 'whoosh', licenseSpdx: 'CC0-1.0', attribution: null, own: true, allowed: true },
      { id: 'sfx-by', title: 'Klik', licenseSpdx: 'CC-BY-4.0', attribution: 'Ses efekti: Ada Yazar (CC BY 4.0)', own: false, allowed: true },
      { id: 'sfx-cc0', title: 'Tık', licenseSpdx: 'CC0-1.0', attribution: null, own: false, allowed: true },
      { id: 'music-by', title: 'Yatak', licenseSpdx: 'CC-BY-4.0', attribution: 'Müzik: Bora Besteci (CC BY 4.0)', own: false, allowed: true },
      { id: 'music-pix', title: 'Pix', licenseSpdx: 'LicenseRef-Pixabay', attribution: null, own: false, allowed: true },
    ];
    const plan = { cues: [{ assetId: 'own' }, { assetId: 'sfx-by' }, { assetId: 'sfx-cc0' }, { assetId: 'sfx-by' }], music: { assetId: 'music-by' } };
    expect(attributionLines(plan, assets, 'tiktok')).toEqual({ lines: ['Ses efekti: Ada Yazar (CC BY 4.0)'], refused: [] });
    expect(attributionLines(plan, assets, 'music')).toEqual({ lines: ['Ses efekti: Ada Yazar (CC BY 4.0)', 'Müzik: Bora Besteci (CC BY 4.0)'], refused: [] });
    expect(attributionLines({ cues: [], music: { assetId: 'music-pix' } }, assets, 'music')).toEqual({ lines: [], refused: [] });
    const revoked = assets.map((a) => (a.id === 'music-by' ? { ...a, allowed: false } : a.id === 'sfx-by' ? { ...a, attribution: ' ' } : a));
    expect(attributionLines(plan, revoked, 'music')).toEqual({ lines: [], refused: ['Klik', 'Yatak'] });
    expect(attributionLines({ cues: [{ assetId: 'gone' }], music: null }, assets, 'tiktok')).toEqual({ lines: [], refused: ['gone'] });
  });

  it('publishChecklist and canMarkPublished: \'sound\' is required for the TikTok variant only; \'aigc\' is required only when the label is required; marking needs every required tick and a valid TikTok URL (tiktok.com/@u/video/id or vm.tiktok.com) — http, other hosts and ports are refused', () => {
    const t = publishChecklist({ variant: 'tiktok', aigcRequired: false });
    expect(t.map((i) => [i.id, i.required])).toEqual([['sound', true], ['visibility', true], ['aigc', false], ['commercial', true]]);
    expect(t.find((i) => i.id === 'aigc')!.label_tr).toBe('AI etiketi gerekmiyor: hazır TTS sesi ve Blender CG');
    const m = publishChecklist({ variant: 'music', aigcRequired: true });
    expect(m.map((i) => [i.id, i.required])).toEqual([['sound', false], ['visibility', true], ['aigc', true], ['commercial', true]]);
    expect(m.find((i) => i.id === 'aigc')!.label_tr).toBe("AI etiketini TikTok'ta açtım (klon ses)");
    const url = 'https://www.tiktok.com/@whats.inside59/video/7423456789012345678';
    const all = { sound: true, visibility: true, commercial: true };
    expect(canMarkPublished(t, all, url)).toBeNull();
    expect(canMarkPublished(t, { visibility: true, commercial: true }, url)).toBe('işaretlenmemiş zorunlu madde: Uygulamadan ses ekle');
    expect(canMarkPublished(m, all, url)).toBe("işaretlenmemiş zorunlu madde: AI etiketini TikTok'ta açtım (klon ses)");
    expect(canMarkPublished(m, { ...all, aigc: true }, url)).toBeNull();
    expect(canMarkPublished(t, all, 'https://example.com/x')).toBe("geçerli bir TikTok video bağlantısı girin");
    expect(isTikTokVideoUrl(url)).toBe(true);
    expect(isTikTokVideoUrl('https://tiktok.com/@a_b.c/video/123')).toBe(true);
    expect(isTikTokVideoUrl('https://vm.tiktok.com/ZMabc123/')).toBe(true);
    for (const bad of ['http://www.tiktok.com/@a/video/1', 'https://www.tiktok.com:8443/@a/video/1', 'https://u:p@www.tiktok.com/@a/video/1', 'https://www.tiktok.com.evil.com/@a/video/1', 'https://www.tiktok.com/@a', 'javascript:alert(1)', 'nonsense']) {
      expect(isTikTokVideoUrl(bad), bad).toBe(false);
    }
  });

  it('nextDraftSlot and tiktokErrorTr: five counted sends in 24 h give the slot 24 h after the oldest; failed sends do not count; every Y18 code maps to Turkish; an unknown code keeps the code and the log id', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
    const sent = (n: number) => ({ createdAt: h(n), status: 'sent' as const, publishId: 'p' });
    expect(DRAFT_LIMIT_24H).toBe(5);
    expect(nextDraftSlot([sent(1), sent(2), sent(3), sent(4)], now)).toBeNull();
    expect(nextDraftSlot([sent(1), sent(2), sent(3), sent(4), sent(10)], now)).toEqual(new Date(h(10).getTime() + 86_400_000));
    expect(nextDraftSlot([sent(1), sent(2), sent(3), sent(4), sent(25)], now)).toBeNull();
    expect(nextDraftSlot([sent(1), sent(2), sent(3), sent(4), { createdAt: h(5), status: 'failed', publishId: null }], now)).toBeNull();
    expect(nextDraftSlot([sent(1), sent(2), sent(3), sent(4), { createdAt: h(5), status: 'failed', publishId: 'p5' }], now)).toEqual(new Date(h(5).getTime() + 86_400_000));
    expect(nextDraftSlot([sent(1), sent(2), sent(3), { createdAt: h(4), status: 'queued', publishId: null }, { createdAt: h(5), status: 'waiting', publishId: 'x' }], now)).not.toBeNull();
    for (const code of TIKTOK_ERROR_CODES) {
      const m = tiktokErrorTr(code);
      expect(m, code).not.toContain(code);
      expect(m.length, code).toBeGreaterThan(10);
    }
    expect(tiktokErrorTr('spam_risk_too_many_pending_share')).toBe("TikTok'ta bekleyen taslak sınırı doldu (24 saatte 5). Gelen kutusundaki taslakları paylaşın ya da silin, sonra yeniden deneyin.");
    expect(tiktokErrorTr('weird_new_code', 'LOG123')).toBe('TikTok hatası: weird_new_code (log kimliği LOG123)');
    expect(tiktokErrorTr('weird_new_code')).toBe('TikTok hatası: weird_new_code');
  });
});
