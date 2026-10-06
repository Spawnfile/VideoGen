import type { FastifyInstance } from 'fastify';

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
// Strict Host shape: loopback name plus an optional numeric port, nothing else (case-sensitive, so it fails closed).
const LOCAL_HOST = /^(\[::1\]|127\.0\.0\.1|localhost)(:\d{1,5})?$/;
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

/** DNS-rebinding guard on EVERY request (reads expose audit and transcripts), CSRF guard on writes. */
export function registerGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (!hostIsLocal(req.headers.host)) return reply.code(403).send({ error: 'forbidden: non-localhost Host' });
    if (WRITES.has(req.method) && !originIsLocal(req.headers.origin)) {
      return reply.code(403).send({ error: 'forbidden: cross-origin write' });
    }
  });
}
