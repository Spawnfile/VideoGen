import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { defaultSafeAreaSetting, SafeAreaSchema, safeAreaWarnings, type SafeAreaSetting, type SafeAreaState } from '@videogen/shared';
import { appendAudit, getSafeArea, setSafeArea } from '@videogen/db';

/** A calibrated area (and the device it was read on), or a return to the default. */
const PutBody = z.union([
  z.strictObject({ area: SafeAreaSchema, note: z.string().trim().max(200).optional() }),
  z.strictObject({ reset: z.literal(true) }),
]);

const state = (s: SafeAreaSetting): SafeAreaState => ({ ...s, warnings: s.source === 'calibrated' ? safeAreaWarnings(s.area) : [] });

/** Plan M7 Y15/Y16 (Ayarlar → Güvenli alan): the area every final is laid out and checked (G6) in; audited as `settings.safe_area`. */
export function registerSafeAreaRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  app.get('/api/safe-area', async () => state(await getSafeArea(deps.pool)));

  app.put('/api/safe-area', async (req, reply) => {
    const b = PutBody.safeParse(req.body ?? {});
    if (!b.success) {
      // The rule an impossible area breaks (top below bottom, too narrow…), when that is the reason.
      const area = SafeAreaSchema.safeParse((req.body as { area?: unknown } | null)?.area);
      const why = area.success ? null : area.error.issues.find((i) => i.code === 'custom')?.message;
      return reply.code(400).send({ error: `geçersiz güvenli alan${why ? `: ${why}` : ''}` });
    }
    const to: SafeAreaSetting = 'reset' in b.data
      ? defaultSafeAreaSetting()
      : { area: b.data.area, source: 'calibrated', measuredAt: new Date().toISOString(), note: b.data.note || null };
    const from = await getSafeArea(deps.pool);
    await setSafeArea(deps.pool, to);
    await appendAudit(deps.pool, { actorType: 'user', action: 'settings.safe_area', subjectType: 'setting', subjectId: 'safe_area', data: { from, to } });
    return state(to);
  });
}
