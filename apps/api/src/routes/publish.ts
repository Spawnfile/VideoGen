import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  attributionLines, CAPTION_MAX, canMarkPublished, captionFor, countsTowardLimit, DAY_MS, DRAFT_LIMIT_24H, nextDraftSlot, PUBLISH_VARIANTS, publishChecklist,
  validateForTikTok, withAttributions, type Config, type Publication, type PublishVariant,
} from '@videogen/shared';
import {
  appendAudit, cancelPublication, createPublication, getPublication, isUuid, listPublications, markPublished, publishEvent, publishSource, recentPublications,
  type PublishSource,
} from '@videogen/db';
import { sendCommand } from './notify.ts';
import { tiktokFor } from './tiktok.ts';

const PublishBody = z.object({
  variant: z.enum(PUBLISH_VARIANTS),
  caption: z.string().optional(),
  confirmResend: z.boolean().optional(),
});
const MarkBody = z.object({ url: z.string().max(300), checklist: z.record(z.string(), z.boolean()) });

const ONES = ['da', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'];
const TENS: Record<number, string> = { 1: 'da', 2: 'de', 3: 'da', 4: 'ta', 5: 'de' };
/** "14:20'de", "14:30'da", "09:00'da": the locative follows the last spoken number (vowel harmony, hard consonants). */
function atTr(d: Date): string {
  const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul', hour12: false });
  const [h, m] = hm.split(':').map(Number) as [number, number];
  const n = m === 0 ? h : m;
  const suffix = n === 0 ? 'da' : n % 10 ? ONES[n % 10]! : TENS[n / 10]!;
  return `${hm}'${suffix}`;
}

const asciiSlug = (s: string) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';

const lines = (src: PublishSource, v: PublishVariant) => (src.soundPlan ? attributionLines(src.soundPlan, src.assets, v) : { lines: [], refused: [] });

export function registerPublishRoutes(app: FastifyInstance, deps: { pool: pg.Pool; config: Config }): void {
  const { pool } = deps;
  const { store } = tiktokFor(deps);
  const vid = (req: { params: unknown }) => (req.params as { id: string }).id;
  const event = (p: Publication) => publishEvent(pool, { topic: `video:${p.videoId}`, type: 'publish.status', payload: { publicationId: p.id, status: p.status, failReason: p.failReason } }).catch(() => {});
  const creatorMax = async () => {
    const v = (await pool.query("SELECT value FROM settings WHERE key = 'tiktok.creator'")).rows[0]?.value;
    return typeof v?.maxDurationS === 'number' ? { maxDurationS: v.maxDurationS as number } : null;
  };
  const statusBlock = (s: string) => (s === 'ready' || s === 'published' ? null : "Yayın yalnızca 'Yayına hazır' videolar için.");

  /** Y5/Y22: the publish view; nothing here calls TikTok (stored media + the creator_info cache). */
  app.get('/api/videos/:id/publish', async (req, reply) => {
    if (!isUuid(vid(req))) return reply.code(400).send({ error: 'geçersiz video' });
    const src = await publishSource(pool, vid(req));
    if (!src) return reply.code(404).send({ error: 'video bulunamadı' });
    const conn = await store.status();
    const now = new Date();
    const recent = await recentPublications(pool, new Date(now.getTime() - DAY_MS));
    const creator = await creatorMax();
    const variantBlockers = Object.fromEntries(PUBLISH_VARIANTS.map((v) => {
      const f = src.variants[v];
      if (!f) return [v, ['bu varyantın finali yok']];
      // Container, pixel format and audio codec come from compose's delivery encode (h264 yuv420p + AAC in MP4); the worker re-probes.
      const probe = { container: 'mp4', vcodec: f.codec ?? 'yok', pixFmt: 'yuv420p', acodec: 'aac', width: f.width ?? 0, height: f.height ?? 0, durationS: f.durationS ?? 0, bytes: f.bytes };
      return [v, [...validateForTikTok(probe, creator), ...lines(src, v).refused.map((t) => `${t} artık izinli değil`)]];
    })) as Record<PublishVariant, string[]>;
    const blockers = [
      ...[statusBlock(src.status)].filter((x): x is string => !!x),
      ...(conn.connected ? [] : ['TikTok bağlı değil: Ayarlar → TikTok bağlantısı.']),
    ];
    const slot = nextDraftSlot(recent, now);
    return {
      eligible: blockers.length === 0, blockers, variantBlockers, connected: conn.connected, username: conn.username,
      draftsUsed: recent.filter(countsTowardLimit).length, draftLimit: DRAFT_LIMIT_24H, nextSlot: slot?.toISOString() ?? null,
      aigcRequired: src.aigcRequired, versionId: src.versionId,
      variants: Object.fromEntries(PUBLISH_VARIANTS.map((v) => [v, src.variants[v] ? { sha: src.variants[v]!.blobSha, bytes: src.variants[v]!.bytes, durationS: src.variants[v]!.durationS } : null])),
      attributions: Object.fromEntries(PUBLISH_VARIANTS.map((v) => [v, lines(src, v).lines])),
      captions: Object.fromEntries(PUBLISH_VARIANTS.map((v) => [v, captionFor({ hookTr: src.hookTr, productName: src.productName, attributions: lines(src, v).lines })])),
      checklist: Object.fromEntries(PUBLISH_VARIANTS.map((v) => [v, publishChecklist({ variant: v, aigcRequired: src.aigcRequired })])),
      claims: src.claims,
      publications: await listPublications(pool, src.videoId),
    };
  });

  app.post('/api/videos/:id/publish', async (req, reply) => {
    if (!isUuid(vid(req))) return reply.code(400).send({ error: 'geçersiz video' });
    const b = PublishBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'geçersiz istek' });
    const src = await publishSource(pool, vid(req));
    if (!src) return reply.code(404).send({ error: 'video bulunamadı' });
    const blocked = statusBlock(src.status);
    if (blocked) return reply.code(409).send({ error: blocked });
    if (!(await store.status()).connected) return reply.code(409).send({ error: 'TikTok bağlı değil: Ayarlar → TikTok bağlantısı.' });
    const f = src.variants[b.data.variant];
    if (!f || !src.versionId) return reply.code(409).send({ error: 'bu varyantın finali yok' });
    const att = lines(src, b.data.variant);
    if (att.refused.length) return reply.code(409).send({ error: att.refused.map((t) => `${t} artık izinli değil`).join('; ') });
    const caption = withAttributions(b.data.caption?.trim() || captionFor({ hookTr: src.hookTr, productName: src.productName, attributions: att.lines }), att.lines);
    if (caption.length > CAPTION_MAX) return reply.code(400).send({ error: `açıklama en çok ${CAPTION_MAX} karakter olabilir (atıflar dahil)` });
    const r = await createPublication(pool, {
      videoId: src.videoId, versionId: src.versionId, variant: b.data.variant, blobSha: f.blobSha, bytes: f.bytes, caption, aigcRequired: src.aigcRequired,
      confirmResend: b.data.confirmResend === true,
    });
    if (r.kind === 'limit') {
      return reply.code(409).send({ error: `Son 24 saatte ${DRAFT_LIMIT_24H} taslak gönderildi; bir sonraki gönderim ${atTr(r.nextSlot)} açılır.`, nextSlot: r.nextSlot.toISOString() });
    }
    if (r.kind === 'sent') return reply.code(409).send({ error: 'Bu sürüm zaten taslak olarak gönderildi.', confirmResend: true });
    if (r.kind === 'created') {
      await appendAudit(pool, {
        actorType: 'user', action: 'publish.queued', subjectType: 'publication', subjectId: r.publication.id,
        data: { videoId: src.videoId, versionId: src.versionId, variant: b.data.variant, sha: f.blobSha, resend: b.data.confirmResend === true },
      });
      await event(r.publication);
    }
    await sendCommand(pool, { type: 'publish.send', publicationId: r.publication.id });
    return reply.code(202).send({ publication: r.publication });
  });

  app.post('/api/publications/:id/mark', async (req, reply) => {
    if (!isUuid(vid(req))) return reply.code(400).send({ error: 'geçersiz gönderim' });
    const b = MarkBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'geçersiz istek' });
    const p = await getPublication(pool, vid(req));
    if (!p) return reply.code(404).send({ error: 'gönderim bulunamadı' });
    if (p.status !== 'sent') return reply.code(409).send({ error: 'Yalnızca gelen kutusuna ulaşmış bir taslak yayınlandı olarak işaretlenebilir.' });
    const items = publishChecklist({ variant: p.variant, aigcRequired: p.aigcRequired });
    const why = canMarkPublished(items, b.data.checklist, b.data.url);
    if (why) return reply.code(400).send({ error: why });
    const checklist = Object.fromEntries(items.map((i) => [i.id, b.data.checklist[i.id] === true]));
    const done = await markPublished(pool, p.id, { url: b.data.url.trim(), checklist });
    if (!done) return reply.code(409).send({ error: 'Yalnızca gelen kutusuna ulaşmış bir taslak yayınlandı olarak işaretlenebilir.' });
    await appendAudit(pool, { actorType: 'user', action: 'publish.marked', subjectType: 'publication', subjectId: p.id, data: { publicationId: p.id, videoId: p.videoId, url: done.url, checklist } });
    await event(done);
    return { publication: done };
  });

  app.post('/api/publications/:id/cancel', async (req, reply) => {
    if (!isUuid(vid(req))) return reply.code(400).send({ error: 'geçersiz gönderim' });
    const p = await cancelPublication(pool, vid(req));
    if (!p) return reply.code(409).send({ error: 'Yalnızca kuyruktaki bir gönderim iptal edilebilir.' });
    await appendAudit(pool, { actorType: 'user', action: 'publish.cancelled', subjectType: 'publication', subjectId: p.id, data: { videoId: p.videoId } });
    await event(p);
    return { publication: p };
  });

  /** Y21 (K16): the music variant to download for Shorts, with its attribution caption. */
  app.post('/api/videos/:id/exports/shorts', async (req, reply) => {
    if (!isUuid(vid(req))) return reply.code(400).send({ error: 'geçersiz video' });
    const src = await publishSource(pool, vid(req));
    if (!src?.variants.music || !src.versionId) return reply.code(409).send({ error: 'müzikli final yok' });
    const att = lines(src, 'music');
    if (att.refused.length) return reply.code(409).send({ error: att.refused.map((t) => `${t} artık izinli değil`).join('; ') });
    const fileName = `${asciiSlug(src.productName)}-shorts.mp4`;
    await appendAudit(pool, { actorType: 'user', action: 'export.shorts', subjectType: 'video', subjectId: src.videoId, data: { videoId: src.videoId, versionId: src.versionId, sha: src.variants.music.blobSha } });
    return {
      url: `/api/blobs/${src.variants.music.blobSha}?download=${fileName}`, fileName,
      caption: captionFor({ hookTr: src.hookTr, productName: src.productName, attributions: att.lines }),
    };
  });
}
