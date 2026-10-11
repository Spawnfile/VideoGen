import type { FastifyInstance } from 'fastify';
import type { TailnetConfig } from './tailnet.ts';

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
// Strict Host shape: loopback name plus an optional numeric port, nothing else (case-sensitive, so it fails closed).
const LOCAL_HOST = /^(\[::1\]|127\.0\.0\.1|localhost)(:\d{1,5})?$/;
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NO_TAILNET: TailnetConfig = { host: null, users: [] };

export type RequestScope = 'local' | 'tailnet';

declare module 'fastify' {
  interface FastifyRequest { vgScope: RequestScope }
}

export function hostIsLocal(host?: string): boolean {
  return host !== undefined && LOCAL_HOST.test(host);
}

export function originIsLocal(origin?: string): boolean {
  if (origin === undefined) return true;
  try {
    return LOCAL.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Tailscale Serve keeps the browser's Host (`<machine>.<tailnet>.ts.net:<port>`) and sets `Tailscale-User-Login` from WhoIs after
 * deleting any client copy (ipn/ipnlocal/serve.go), so the login cannot be forged from the tailnet. The API still listens on loopback only.
 */
export function requestScope(headers: Record<string, string | string[] | undefined>, cfg: TailnetConfig): RequestScope | null {
  const host = typeof headers.host === 'string' ? headers.host : undefined;
  if (hostIsLocal(host)) return 'local';
  const login = headers['tailscale-user-login'];
  if (cfg.host && host === cfg.host && typeof login === 'string' && cfg.users.includes(login)) return 'tailnet';
  return null;
}

/** DNS-rebinding guard on EVERY request (reads expose audit and transcripts), CSRF guard on writes. */
export function registerGuard(app: FastifyInstance, tailnet: TailnetConfig = NO_TAILNET): void {
  app.decorateRequest('vgScope', 'local');
  app.addHook('onRequest', async (req, reply) => {
    const scope = requestScope(req.headers, tailnet);
    if (!scope) {
      const tailnetHost = tailnet.host !== null && req.headers.host === tailnet.host;
      return reply.code(403).send({ error: tailnetHost ? 'forbidden: tailnet user not allowed' : 'forbidden: non-localhost Host' });
    }
    req.vgScope = scope;
    const sameOrigin = scope === 'local' ? originIsLocal(req.headers.origin) : req.headers.origin === undefined || req.headers.origin === `https://${tailnet.host}`;
    if (WRITES.has(req.method) && !sameOrigin) return reply.code(403).send({ error: 'forbidden: cross-origin write' });
  });
}
