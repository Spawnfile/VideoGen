import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { hostIsLocal, originIsLocal, registerGuard, requestScope } from '../src/guard.ts';
import { tailnetConfig } from '../src/tailnet.ts';

describe('localhost guard', () => {
  it('accepts only loopback hosts', () => {
    expect(['127.0.0.1:5180', 'localhost:5173', '[::1]:5180', 'localhost'].map(hostIsLocal)).toEqual([true, true, true, true]);
    expect([undefined, 'evil.example', 'evil.example:5180', '127.0.0.1.evil.example', '192.168.1.49:5180', 'localhost:evil.example', '127.0.0.1:', '127.0.0.1:123456', '127.0.0.1:80x'].map(hostIsLocal)).toEqual([false, false, false, false, false, false, false, false, false]);
  });

  it('accepts missing or loopback origins only', () => {
    expect([undefined, 'http://127.0.0.1:5180', 'http://localhost:5173', 'http://[::1]:5180'].map(originIsLocal)).toEqual([true, true, true, true]);
    expect(['http://evil.example', 'null', 'not a url'].map(originIsLocal)).toEqual([false, false, false]);
  });

  it('blocks non-local Host on reads and cross-origin writes', async () => {
    const app = Fastify();
    registerGuard(app);
    app.get('/api/x', async () => ({ ok: true }));
    app.post('/api/x', async () => ({ ok: true }));
    expect((await app.inject({ method: 'GET', url: '/api/x', headers: { host: 'evil.example:5180' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/x', headers: { host: '127.0.0.1:5180' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/x', headers: { host: '127.0.0.1:5180', origin: 'http://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/x', headers: { host: '127.0.0.1:5180', origin: 'http://127.0.0.1:5180' } })).statusCode).toBe(200);
  });
});

describe('tailnet access (mobile PWA through Tailscale Serve)', () => {
  const cfg = { host: 'alper-pc.tailef7c0d.ts.net:8443', users: ['me@example.com'] };
  const login = 'tailscale-user-login';
  async function app() {
    const a = Fastify();
    registerGuard(a, cfg);
    a.get('/api/x', async (req) => ({ scope: req.vgScope }));
    a.post('/api/x', async () => ({ ok: true }));
    return a;
  }

  it('reads the tailnet host and users from the environment; either missing turns tailnet access off', () => {
    expect(tailnetConfig({ VG_TAILNET_HOST: 'a.ts.net:8443', VG_TAILNET_USERS: 'x@y.z, q@r.s' })).toEqual({ host: 'a.ts.net:8443', users: ['x@y.z', 'q@r.s'] });
    expect(tailnetConfig({ VG_TAILNET_HOST: 'a.ts.net:8443' })).toEqual({ host: null, users: [] });
    expect(tailnetConfig({})).toEqual({ host: null, users: [] });
  });

  it('scopes a request: loopback is local, the exact tailnet host with an allowed login is tailnet, anything else is refused', () => {
    expect(requestScope({ host: '127.0.0.1:5181' }, cfg)).toBe('local');
    expect(requestScope({ host: cfg.host, [login]: 'me@example.com' }, cfg)).toBe('tailnet');
    expect(requestScope({ host: cfg.host }, cfg)).toBeNull();
    expect(requestScope({ host: cfg.host, [login]: 'other@example.com' }, cfg)).toBeNull();
    expect(requestScope({ host: 'ALPER-PC.tailef7c0d.ts.net:8443', [login]: 'me@example.com' }, cfg)).toBeNull();
    expect(requestScope({ host: 'alper-pc.tailef7c0d.ts.net', [login]: 'me@example.com' }, cfg)).toBeNull();
    expect(requestScope({ host: cfg.host, [login]: 'me@example.com' }, { host: null, users: [] })).toBeNull();
  });

  it('serves an allowed tailnet user and marks the request scope', async () => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/api/x', headers: { host: cfg.host, [login]: 'me@example.com' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ scope: 'tailnet' });
    expect((await a.inject({ method: 'GET', url: '/api/x', headers: { host: '127.0.0.1:5181' } })).json()).toEqual({ scope: 'local' });
  });

  it('refuses the tailnet host without an allowed login', async () => {
    const a = await app();
    const none = await a.inject({ method: 'GET', url: '/api/x', headers: { host: cfg.host } });
    expect(none.statusCode).toBe(403);
    expect(none.json()).toEqual({ error: 'forbidden: tailnet user not allowed' });
    expect((await a.inject({ method: 'GET', url: '/api/x', headers: { host: cfg.host, [login]: 'other@example.com' } })).statusCode).toBe(403);
  });

  it('accepts tailnet writes only from the tailnet origin', async () => {
    const a = await app();
    const h = { host: cfg.host, [login]: 'me@example.com' };
    expect((await a.inject({ method: 'POST', url: '/api/x', headers: { ...h, origin: `https://${cfg.host}` } })).statusCode).toBe(200);
    expect((await a.inject({ method: 'POST', url: '/api/x', headers: { ...h, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await a.inject({ method: 'POST', url: '/api/x', headers: { ...h, origin: 'http://127.0.0.1:5181' } })).statusCode).toBe(403);
  });

  it('keeps the loopback message when tailnet access is not configured', async () => {
    const a = Fastify();
    registerGuard(a, { host: null, users: [] });
    a.get('/api/x', async () => ({ ok: true }));
    const r = await a.inject({ method: 'GET', url: '/api/x', headers: { host: cfg.host, [login]: 'me@example.com' } });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ error: 'forbidden: non-localhost Host' });
  });
});
