import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { CHANNEL_STYLE_IDS, CHANNEL_STYLES, type ChannelStyleId } from '@videogen/shared';
import { appendAudit, getChannelStyle, setChannelStyle } from '@videogen/db';

export interface ChannelStyleState {
  id: ChannelStyleId;
  /** false: nothing chosen yet; the provisional default is in use (plan B12). */
  chosen: boolean;
  options: { id: ChannelStyleId; name_tr: string; description_tr: string; image: string }[];
}

const Body = z.object({ id: z.enum(CHANNEL_STYLE_IDS) }).strict();

/** K19 (spec §13.1 Ayarlar → kanal kimliği): the three options with their pen renders (apps/web/public/k19) and the choice. */
export function registerChannelRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  const state = async (): Promise<ChannelStyleState> => ({
    ...(await getChannelStyle(deps.pool)),
    options: CHANNEL_STYLE_IDS.map((id) => ({ id, name_tr: CHANNEL_STYLES[id].name_tr, description_tr: CHANNEL_STYLES[id].description_tr, image: `/k19/${id}.png` })),
  });

  app.get('/api/channel-style', async () => state());

  app.put('/api/channel-style', async (req, reply) => {
    const b = Body.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'geçersiz kanal kimliği' });
    const before = await getChannelStyle(deps.pool);
    await setChannelStyle(deps.pool, b.data.id);
    await appendAudit(deps.pool, { actorType: 'user', action: 'settings.channel_style', subjectType: 'setting', subjectId: 'channel.style', data: { from: before.chosen ? before.id : null, to: b.data.id } });
    return state();
  });
}
