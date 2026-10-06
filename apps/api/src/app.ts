import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { ClaudeAuth, Config, GuardState, UsageSnapshot } from '@videogen/shared';
import { appendAudit, maxEventId, verifyAudit } from '@videogen/db';
import type { EventHub } from './event-hub.ts';
import { registerGuard } from './guard.ts';
import { registerAgentRoutes } from './routes/agents.ts';
import { registerChatRoutes } from './routes/chat.ts';
import { registerRoleRoutes } from './routes/roles.ts';
import { registerSse } from './sse.ts';

const round4 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10_000) / 10_000);

export async function buildApp(deps: { pool: pg.Pool; hub: EventHub; config: Config; heartbeatMs?: number }): Promise<FastifyInstance> {
  const app = Fastify({ forceCloseConnections: true, logger: { level: process.env.VG_LOG_LEVEL ?? 'info' } });
  registerGuard(app);
  // Freshness watermark (M2 §7): read before the handler runs, so a client can drop REST data older than SSE it already applied.
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET' && req.url.startsWith('/api/') && !req.url.startsWith('/api/health')) {
      reply.header('x-vg-event-id', String(await maxEventId(deps.pool)));
    }
  });

  app.get('/api/health', async () => {
    await deps.pool.query('SELECT 1');
    return { ok: true };
  });

  app.get('/api/claude/status', async () => {
    const { rows } = await deps.pool.query("SELECT value FROM settings WHERE key = 'claude.auth'");
    return (rows[0]?.value ?? null) as ClaudeAuth | null;
  });

  app.get('/api/usage', async () => {
    const { rows } = await deps.pool.query('SELECT * FROM usage_snapshots ORDER BY id DESC LIMIT 1');
    const r = rows[0];
    if (!r) return null;
    const snap: UsageSnapshot = {
      source: r.source,
      fiveHour: r.five_hour_util === null && !r.five_hour_resets_at ? null : { utilization: round4(r.five_hour_util), resetsAt: r.five_hour_resets_at?.toISOString() ?? null },
      sevenDay: r.seven_day_util === null && !r.seven_day_resets_at ? null : { utilization: round4(r.seven_day_util), resetsAt: r.seven_day_resets_at?.toISOString() ?? null },
      status: r.status,
      subscriptionType: r.subscription_type,
      at: r.ts.toISOString(),
    };
    return snap;
  });
  app.get('/api/usage/guard', async () => {
    const { rows } = await deps.pool.query("SELECT value FROM settings WHERE key = 'usage.guard'");
    return (rows[0]?.value ?? { blocked: false, reason: null, resumeAt: null, fiveHour: null, sevenDay: null }) as GuardState;
  });

  app.post('/api/claude/refresh', async (_req, reply) => {
    await deps.pool.query('SELECT pg_notify($1, $2)', ['vg_commands', JSON.stringify({ type: 'claude.refresh' })]);
    await appendAudit(deps.pool, { actorType: 'user', action: 'claude.refresh_requested' });
    return reply.code(202).send({ accepted: true });
  });

  app.get('/api/audit/verify', async () => verifyAudit(deps.pool));

  registerAgentRoutes(app, deps);
  registerChatRoutes(app, deps);
  registerRoleRoutes(app, { pool: deps.pool, devEndpoints: deps.config.devEndpoints });
  registerSse(app, deps);

  if (existsSync(join(deps.config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: deps.config.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api') || req.url.startsWith('/events') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html'),
    );
  }
  return app;
}
