import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from '@videogen/shared';
import { appendAudit } from '@videogen/db';
import { authorizeUrl, pgRateGate, pkce, TikTokClient, TikTokError, TIKTOK_SCOPES, TokenStore } from '@videogen/tiktok';

export interface TikTokDeps { pool: pg.Pool; config: Config; connectTtlMs?: number }

/** One TikTok client per process; the rate gate is shared with the worker through settings (plan Y7). */
export function tiktokFor(deps: { pool: pg.Pool; config: Config }) {
  const gate = pgRateGate(deps.pool, { perMinute: deps.config.tiktok.ratePerMinute });
  const store = new TokenStore({ dir: join(deps.config.dataDir, 'secrets'), pool: deps.pool, base: deps.config.tiktok.base, gate });
  const client = new TikTokClient({ base: deps.config.tiktok.base, tokens: store, gate });
  return { store, client };
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="tr"><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;padding:2rem"><h1 style="font-weight:500">${title}</h1><p>${body}</p></body></html>`;

const sameState = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Plan M6 Y16: the PKCE flow. A short-lived listener on 127.0.0.1:<callbackPort> (redirect URI http://localhost:3455/callback/, registered in
 * the TikTok portal) takes exactly one valid callback, at most for 5 minutes. The flow state lives only in this process's memory.
 */
class ConnectFlow {
  private active: { server: Server; url: string; expiresAt: Date; state: string; verifier: string; redirectUri: string; timer: NodeJS.Timeout } | null = null;

  constructor(private readonly deps: TikTokDeps, private readonly t: ReturnType<typeof tiktokFor>) {}

  async start(): Promise<{ authorizeUrl: string; expiresAt: string }> {
    if (this.active) return { authorizeUrl: this.active.url, expiresAt: this.active.expiresAt.toISOString() };
    const client = await this.t.store.client();
    if (!client) throw Object.assign(new Error('İstemci bilgisi yok: önce `node bin/tiktok.mjs import` çalıştırın.'), { status: 409 });
    const p = pkce();
    const server = createServer((req, res) => { void this.callback(req.url ?? '/', res); });
    await new Promise<void>((resolve, reject) => {
      server.once('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EADDRINUSE'
        ? Object.assign(new Error(`${this.deps.config.tiktok.callbackPort} portu kullanımda (eski auth.py açık olabilir).`), { status: 409 }) : e));
      server.listen(this.deps.config.tiktok.callbackPort, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const redirectUri = `http://localhost:${port}/callback/`;
    const ttl = this.deps.connectTtlMs ?? 5 * 60_000;
    const timer = setTimeout(() => { this.close(); }, ttl);
    timer.unref();
    const url = authorizeUrl({ clientKey: client.clientKey, scopes: TIKTOK_SCOPES, redirectUri, state: p.state, challenge: p.challenge });
    this.active = { server, url, expiresAt: new Date(Date.now() + ttl), state: p.state, verifier: p.verifier, redirectUri, timer };
    return { authorizeUrl: url, expiresAt: this.active.expiresAt.toISOString() };
  }

  /** Stops accepting connections; open ones end after `res` (if given) is sent, so the browser still gets its page. */
  close(res?: import('node:http').ServerResponse): void {
    const a = this.active;
    this.active = null;
    if (!a) return;
    clearTimeout(a.timer);
    a.server.close();
    if (res) res.once('finish', () => a.server.closeAllConnections());
    else a.server.closeAllConnections();
  }

  private async callback(raw: string, res: import('node:http').ServerResponse): Promise<void> {
    const send = (status: number, title: string, body: string) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(page(title, body)); };
    const a = this.active;
    const u = new URL(raw, 'http://localhost');
    if (!a || (u.pathname !== '/callback/' && u.pathname !== '/callback')) return send(404, 'Bulunamadı', '');
    if (u.searchParams.get('error')) {
      this.close(res);
      return send(200, 'Bağlantı iptal edildi', 'TikTok izni verilmedi. VideoGen Ayarlar sayfasından yeniden deneyebilirsiniz.');
    }
    const code = u.searchParams.get('code') ?? '';
    if (!code || !sameState(u.searchParams.get('state') ?? '', a.state)) return send(400, 'Geçersiz istek', 'Bağlantı isteği doğrulanamadı.');
    this.close(res);
    try {
      const tokens = await this.t.store.exchangeCode(code, a.verifier, a.redirectUri);
      const { username } = await this.t.client.creatorInfo();
      await this.t.store.setUsername(username);
      const scopes = tokens.scope.split(/[,\s]+/).filter(Boolean).sort();
      await appendAudit(this.deps.pool, { actorType: 'user', action: 'tiktok.connected', subjectType: 'setting', subjectId: 'tiktok', data: { username, scopes, via: 'pkce' } });
      send(200, 'Bağlandı, bu sekmeyi kapatabilirsiniz', `TikTok hesabı: @${username.replace(/[^A-Za-z0-9._]/g, '')}`);
    } catch (e) {
      send(502, 'Bağlanamadı', e instanceof TikTokError ? e.message : 'TikTok token isteği başarısız oldu.');
    }
  }
}

export function registerTikTokRoutes(app: FastifyInstance, deps: TikTokDeps): void {
  const t = tiktokFor(deps);
  const flow = new ConnectFlow(deps, t);
  app.addHook('onClose', async () => { flow.close(); });

  app.get('/api/tiktok', async () => t.store.status());

  app.post('/api/tiktok/connect', async (_req, reply) => {
    try {
      return await flow.start();
    } catch (e) {
      return reply.code((e as { status?: number }).status ?? 500).send({ error: (e as Error).message });
    }
  });

  app.post('/api/tiktok/test', async (_req, reply) => {
    try {
      const c = await t.client.creatorInfo();
      await deps.pool.query(
        "INSERT INTO settings (key, value, updated_at) VALUES ('tiktok.creator', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
        [JSON.stringify({ at: Date.now(), ...c })],
      );
      return c;
    } catch (e) {
      if (e instanceof TikTokError) return reply.code(409).send({ error: e.message, code: e.code });
      return reply.code(502).send({ error: 'TikTok bağlantısı sınanamadı.' });
    }
  });
}
