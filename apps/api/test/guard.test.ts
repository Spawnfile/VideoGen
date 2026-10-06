import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { hostIsLocal, originIsLocal, registerGuard } from '../src/guard.ts';

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
