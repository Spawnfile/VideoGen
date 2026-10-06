import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { insertArtifact, maxEventId, readEventsAfter, updateRun } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
let listener: pg.Client;
const commands: Record<string, unknown>[] = [];
const H = { host: '127.0.0.1:5180' };

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', devEndpoints: false } });
  listener = new pg.Client({ connectionString: t.appUrl });
  await listener.connect();
  listener.on('notification', (n) => { if (n.channel === 'vg_commands') commands.push(JSON.parse(n.payload!)); });
  await listener.query('LISTEN vg_commands');
});
afterAll(async () => { await listener.end(); await app.close(); await hub.stop(); await t.drop(); });
const settle = () => new Promise((r) => setTimeout(r, 80));
const produce = (payload: unknown) => app.inject({ method: 'POST', url: '/api/videos', headers: H, payload: payload as object });

describe('produce', () => {
  it('creates the run, publishes both views and sends run.start with ids only', async () => {
    const before = await maxEventId(t.pool);
    const r = await produce({ productName: '  Tükenmez kalem ', audioMode: 'silent' });
    expect(r.statusCode).toBe(202);
    const { videoId, runId } = r.json();
    await settle();
    expect(commands.at(-1)).toEqual({ type: 'run.start', runId });
    expect(JSON.stringify(commands.at(-1))).not.toContain('Tükenmez');
    const types = (await readEventsAfter(t.pool, before)).map((e) => `${e.topic}:${e.type}`);
    expect(types).toEqual(['runs:run.updated', 'videos:video.updated']);
    const v = (await app.inject({ url: `/api/videos/${videoId}`, headers: H })).json();
    expect(v.video).toMatchObject({ id: videoId, productName: 'Tükenmez kalem', status: 'queued', audioMode: 'silent' });
    expect(v.runs[0]).toMatchObject({ id: runId, status: 'queued' });
    expect(v.runs[0].steps.map((s: { key: string }) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render']);
    expect((await app.inject({ url: '/api/videos', headers: H })).json()[0].id).toBe(videoId);
  });

  it('rejects bad input with a Turkish message and unknown ids with 404', async () => {
    for (const body of [{ productName: 'x', audioMode: 'silent' }, { productName: 'a'.repeat(81), audioMode: 'silent' }, { productName: 'kalem\u0007', audioMode: 'silent' }, { productName: 'kalem', audioMode: 'loud' }]) {
      const r = await produce(body);
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/ürün adı|ses modu/);
    }
    expect((await app.inject({ url: '/api/videos/00000000-0000-4000-8000-000000000000', headers: H })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/videos/nope', headers: H })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/runs/nope', headers: H })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/artifacts/nope', headers: H })).statusCode).toBe(404);
  });

  it('write endpoints keep the M2 guard (a foreign Origin is refused)', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/videos', headers: { ...H, origin: 'http://evil.example' }, payload: { productName: 'Kalem', audioMode: 'vo' } });
    expect(r.statusCode).toBe(403);
  });
});

describe('runs and artifacts', () => {
  it('cancels only an active run and serves artifact content', async () => {
    const { runId } = (await produce({ productName: 'Zımba', audioMode: 'vo' })).json();
    expect((await app.inject({ url: `/api/runs/${runId}`, headers: H })).json()).toMatchObject({ id: runId, status: 'queued' });
    const c = await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel`, headers: H });
    expect(c.statusCode).toBe(202);
    await settle();
    expect(commands.at(-1)).toEqual({ type: 'run.cancel', runId });
    await updateRun(t.pool, runId, { status: 'cancelled' });
    expect((await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel`, headers: H })).statusCode).toBe(409);
    const a = await insertArtifact(t.pool, { runId, kind: 'research', content: { interpretation: 'zımba' } });
    expect((await app.inject({ url: `/api/artifacts/${a.id}`, headers: H })).json()).toMatchObject({ id: a.id, kind: 'research', content: { interpretation: 'zımba' } });
  });
});
