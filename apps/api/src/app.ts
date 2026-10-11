import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { ClaudeAuth, Config, GuardState, UsageSnapshot } from '@videogen/shared';
import { appendAudit, maxEventId } from '@videogen/db';
import type { EventHub } from './event-hub.ts';
import { registerGuard } from './guard.ts';
import { tailnetConfig, type TailnetConfig } from './tailnet.ts';
import { registerAgentRoutes } from './routes/agents.ts';
import { registerAssetRoutes } from './routes/assets.ts';
import { registerAuditRoutes } from './routes/audit.ts';
import { registerChatRoutes } from './routes/chat.ts';
import { registerMaintenanceRoutes } from './routes/maintenance.ts';
import { registerMediaRoutes } from './routes/media.ts';
import { registerRoleRoutes } from './routes/roles.ts';
import { registerPlatformRoutes } from './routes/platforms.ts';
import { registerVideoRoutes } from './routes/videos.ts';
import { registerSafeAreaRoutes } from './routes/safe-area.ts';
import { registerDevReadyVideo } from './routes/dev.ts';
import { registerSse } from './sse.ts';

const round4 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10_000) / 10_000);

export async function buildApp(deps: { pool: pg.Pool; hub: EventHub; config: Config; heartbeatMs?: number; uploadMaxBytes?: number; tailnet?: TailnetConfig }): Promise<FastifyInstance> {
  const app = Fastify({ forceCloseConnections: true, logger: { level: process.env.VG_LOG_LEVEL ?? 'info' } });
  registerGuard(app, deps.tailnet ?? tailnetConfig());
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

  registerAuditRoutes(app, { pool: deps.pool });
  registerAgentRoutes(app, deps);
  registerChatRoutes(app, deps);
  registerVideoRoutes(app, { pool: deps.pool, devEndpoints: deps.config.devEndpoints });
  registerPlatformRoutes(app, { pool: deps.pool });
  // One @fastify/static instance owns reply.sendFile (Range, ETag); it serves no route of its own. The SPA instance below adds none.
  await app.register(fastifyStatic, { root: deps.config.dataDir, serve: false });
  registerMediaRoutes(app, { pool: deps.pool, dataDir: deps.config.dataDir });
  registerRoleRoutes(app, { pool: deps.pool, devEndpoints: deps.config.devEndpoints });
  registerSafeAreaRoutes(app, { pool: deps.pool });
  registerAssetRoutes(app, { pool: deps.pool, config: deps.config, ...(deps.uploadMaxBytes ? { uploadMaxBytes: deps.uploadMaxBytes } : {}) });
  if (deps.config.devEndpoints) registerDevReadyVideo(app, deps.pool);
  registerMaintenanceRoutes(app, { pool: deps.pool, dataDir: deps.config.dataDir });
  registerSse(app, deps);

  if (existsSync(join(deps.config.webDist, 'index.html'))) {
    // An installed app must notice a new build: the page, the service worker and the manifest are always revalidated; Vite's hashed
    // files never change under one name, so they are cached for a year.
    await app.register(fastifyStatic, {
      root: deps.config.webDist, wildcard: false, decorateReply: false, cacheControl: false,
      setHeaders: (reply, path) => {
        const name = path.slice(path.lastIndexOf('/') + 1);
        reply.header('cache-control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        if (name === 'sw.js') reply.header('service-worker-allowed', '/');
        if (name === 'manifest.webmanifest') reply.header('content-type', 'application/manifest+json; charset=utf-8');
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api') || req.url.startsWith('/events') ? reply.code(404).send({ error: 'not found' }) : reply.header('cache-control', 'no-cache').sendFile('index.html', deps.config.webDist, { cacheControl: false }),
    );
  }
  return app;
}
