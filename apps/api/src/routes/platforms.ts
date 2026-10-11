import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { CAPTION_MAX, FUTURE_SLACK_MS, PLATFORM_ACTIONS, PLATFORM_NOTE_MAX, PLATFORM_URL_MAX, PLATFORMS, YOUTUBE_TITLE_MAX, type Platform } from '@videogen/shared';
import { finalLicence, getVideoView, isUuid, listPlatformEvents, recordPlatformEvent, setVideoText } from '@videogen/db';

const NAME: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };

const Mark = z.object({
  platform: z.enum(PLATFORMS, { error: 'the platform must be youtube, instagram or tiktok' }),
  action: z.enum(PLATFORM_ACTIONS, { error: 'the action must be uploaded or retracted' }),
  uploadedAt: z.iso.datetime({ offset: true, error: 'the upload time must be an ISO date' })
    .refine((s) => Date.parse(s) <= Date.now() + FUTURE_SLACK_MS, 'the upload time cannot be in the future').optional(),
  url: z.string().trim().max(PLATFORM_URL_MAX, `the link can be at most ${PLATFORM_URL_MAX} characters`)
    .refine((s) => s === '' || /^https:\/\/\S+$/.test(s), 'the link must start with https://').optional(),
  note: z.string().max(PLATFORM_NOTE_MAX, `the note can be at most ${PLATFORM_NOTE_MAX} characters`).optional(),
});
const Text = z.object({
  caption: z.string().max(CAPTION_MAX, `the caption can be at most ${CAPTION_MAX} characters`).nullable().optional(),
  youtubeTitle: z.string().max(YOUTUBE_TITLE_MAX, `the YouTube title can be at most ${YOUTUBE_TITLE_MAX} characters`).nullable().optional(),
}).refine((b) => b.caption !== undefined || b.youtubeTitle !== undefined, 'nothing to change');

/** Video library L18: the manual upload log (phone and desktop) and the texts the user copies into the platform apps. */
export function registerPlatformRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  const { pool } = deps;
  const id = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get('/api/videos/:id/platforms', async (req, reply) => {
    const v = isUuid(id(req)) ? await getVideoView(pool, id(req)) : null;
    if (!v) return reply.code(404).send({ error: 'not found' });
    const lic = await finalLicence(pool, v.id);
    return { state: v.platforms, events: await listPlatformEvents(pool, v.id), attributions: lic.attributions, refused: lic.refused };
  });

  app.post('/api/videos/:id/platforms', async (req, reply) => {
    if (!isUuid(id(req))) return reply.code(404).send({ error: 'not found' });
    const b = Mark.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'invalid request' });
    const out = await recordPlatformEvent(pool, {
      videoId: id(req), platform: b.data.platform, action: b.data.action,
      ...(b.data.uploadedAt ? { uploadedAt: new Date(b.data.uploadedAt) } : {}), url: b.data.url ?? null, note: b.data.note ?? null,
    });
    if ('error' in out) {
      if (out.error === 'video_not_found') return reply.code(404).send({ error: 'not found' });
      if (out.error === 'no_final') return reply.code(409).send({ error: 'This video has no downloadable final yet.' });
      if (out.error === 'licence_refused') return reply.code(409).send({ error: out.refused.map((t) => `${t} is no longer allowed`).join('; '), refused: out.refused });
      return reply.code(409).send({ error: `Nothing to undo: it is not marked as uploaded on ${NAME[b.data.platform]}.` });
    }
    return reply.code(201).send(out);
  });

  app.patch('/api/videos/:id/text', async (req, reply) => {
    if (!isUuid(id(req))) return reply.code(404).send({ error: 'not found' });
    const b = Text.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'invalid request' });
    const v = await setVideoText(pool, id(req), b.data);
    return v ?? reply.code(404).send({ error: 'not found' });
  });
}
