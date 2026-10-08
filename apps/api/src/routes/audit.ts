import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { AUDIT_LIMIT_MAX, type AuditVerifyResult } from '@videogen/shared';
import { auditActions, auditDetail, isUuid, listAudit, verifyAuditTimed } from '@videogen/db';

const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const isoDate = (name: string) => z.string().refine((s) => ISO.test(s) && !Number.isNaN(Date.parse(s)), `${name} geçerli bir ISO tarih olmalı`);
const uuid = (msg: string) => z.string().refine(isUuid, msg);
const posInt = (msg: string, max = Number.MAX_SAFE_INTEGER) =>
  z.string().regex(/^\d{1,16}$/, msg).transform(Number).refine((n) => n >= 1 && n <= max, msg);

const AuditQuery = z.object({
  run: uuid('run bir uuid olmalı').optional(),
  video: uuid('video bir uuid olmalı').optional(),
  session: uuid('oturum (session) bir uuid olmalı').optional(),
  role: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'rol (role) geçersiz').optional(),
  action: z.string().regex(/^[a-z0-9_.]{1,80}\*?$/, 'eylem (action) geçersiz: tam ad ya da publish.* gibi önek').optional(),
  from: isoDate('from').optional(),
  to: isoDate('to').optional(),
  before: posInt('before pozitif bir tam sayı olmalı').optional(),
  limit: posInt(`limit 1 ile ${AUDIT_LIMIT_MAX} arasında bir tam sayı olmalı`, AUDIT_LIMIT_MAX).optional(),
});

/** Plan M7 Y5: `audit_verify()` scans the whole chain, so its last result is kept in process memory for this long. */
export const VERIFY_CACHE_MS = 10 * 60_000;

/** Read-only audit explorer endpoints (spec §13.1); the localhost guard applies to every request. */
export function registerAuditRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  const { pool } = deps;
  let last: { at: number; result: AuditVerifyResult } | null = null;

  app.get('/api/audit', async (req, reply) => {
    const q = AuditQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? 'geçersiz sorgu' });
    const { run, video, session, ...rest } = q.data;
    return listAudit(pool, { ...rest, ...(run ? { runId: run } : {}), ...(video ? { videoId: video } : {}), ...(session ? { sessionId: session } : {}) });
  });

  app.get('/api/audit/actions', async () => auditActions(pool));

  app.get('/api/audit/verify', async (req) => {
    const fresh = (req.query as { fresh?: string } | undefined)?.fresh === '1';
    if (!fresh && last && Date.now() - last.at < VERIFY_CACHE_MS) return { ...last.result, cached: true };
    const result = await verifyAuditTimed(pool);
    last = { at: Date.now(), result };
    return { ...result, cached: false };
  });

  app.get('/api/audit/:seq', async (req, reply) => {
    const raw = (req.params as { seq: string }).seq;
    const d = /^\d{1,16}$/.test(raw) ? await auditDetail(pool, Number(raw)) : null;
    return d ?? reply.code(404).send({ error: 'not found' });
  });
}
