import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { insertAsset, insertBlob } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
const H = { host: '127.0.0.1:5180' };

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent' } });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); });

const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/api/narrator-voice', headers: H, payload: payload as object });

describe('narrator voice (K17)', () => {
  it('offers the engines and voices (a clone only with an allowed voice_ref), starts provisional, stores a choice with an audit row, rejects a clone without a reference', async () => {
    const first = (await app.inject({ url: '/api/narrator-voice', headers: H })).json();
    expect(first).toMatchObject({ voice: { engine: 'chatterbox', voice: { kind: 'preset', id: 'hazir' } }, chosen: false });
    expect(first.options.map((o: { engine: string; voices: { kind: string }[] }) => [o.engine, o.voices.map((v) => v.kind)])).toEqual([['chatterbox', ['preset']], ['freya', ['preset']]]);

    // A clone is refused without a reference, with an unknown one, and with a voice_ref whose license is not the own-voice one.
    for (const c of 'abc') await insertBlob(t.pool, { sha256: c.repeat(64), path: `media/${c}`, bytes: 1, mime: 'audio/wav' });
    const own = await insertAsset(t.pool, { kind: 'voice_ref', title: 'Kendi sesim', blobSha: 'a'.repeat(64), licenseSpdx: 'LicenseRef-Own-Voice', author: 'Alper', allowed: true });
    const foreign = await insertAsset(t.pool, { kind: 'voice_ref', title: 'Başkasının sesi', blobSha: 'b'.repeat(64), licenseSpdx: 'CC0-1.0', author: 'X', allowed: false });
    const music = await insertAsset(t.pool, { kind: 'music', title: 'Parça', blobSha: 'c'.repeat(64), licenseSpdx: 'CC0-1.0', author: 'X', allowed: true });
    for (const asset_id of [crypto.randomUUID(), foreign!.id, music!.id]) {
      expect((await put({ engine: 'chatterbox', voice: { kind: 'clone', asset_id } })).statusCode).toBe(400);
    }
    expect((await put({ engine: 'chatterbox', voice: { kind: 'clone' } })).statusCode).toBe(400);
    expect((await put({ engine: 'freya', voice: { kind: 'clone', asset_id: own!.id } })).statusCode).toBe(400);
    expect((await put({ engine: 'chatterbox', voice: { kind: 'preset', id: 'leyla' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/narrator-voice', headers: H })).json().voice.voice.id).toBe('hazir');

    // Only the allowed own-voice reference is offered.
    const offered = (await app.inject({ url: '/api/narrator-voice', headers: H })).json().options[0].voices;
    expect(offered).toEqual([{ kind: 'preset', id: 'hazir', label_tr: expect.any(String) }, { kind: 'clone', asset_id: own!.id, label_tr: 'Kendi sesim' }]);

    const freya = await put({ engine: 'freya', voice: { kind: 'preset', id: 'leyla' } });
    expect(freya.json()).toMatchObject({ voice: { engine: 'freya', voice: { kind: 'preset', id: 'leyla' } }, chosen: true });
    const clone = await put({ engine: 'chatterbox', voice: { kind: 'clone', asset_id: own!.id } });
    expect(clone.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/narrator-voice', headers: H })).json()).toMatchObject({ voice: { engine: 'chatterbox', voice: { kind: 'clone', asset_id: own!.id } }, chosen: true });
    expect((await put({ engine: 'chatterbox', voice: { kind: 'preset', id: 'hazir' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: '/api/narrator-voice', headers: { ...H, origin: 'http://evil.example' }, payload: { engine: 'freya', voice: { kind: 'preset', id: 'leyla' } } })).statusCode).toBe(403);

    const { rows } = await t.pool.query("SELECT data FROM audit_log WHERE action = 'settings.narrator_voice' ORDER BY seq");
    expect(rows.map((r) => r.data)).toEqual([
      { from: null, to: { engine: 'freya', voice: { kind: 'preset', id: 'leyla' } } },
      { from: { engine: 'freya', voice: { kind: 'preset', id: 'leyla' } }, to: { engine: 'chatterbox', voice: { kind: 'clone', asset_id: own!.id } } },
      { from: { engine: 'chatterbox', voice: { kind: 'clone', asset_id: own!.id } }, to: { engine: 'chatterbox', voice: { kind: 'preset', id: 'hazir' } } },
    ]);

    // A stored value that no longer validates falls back to the provisional default.
    await t.pool.query("UPDATE settings SET value = '{\"voice\":{\"engine\":\"x\"}}' WHERE key = 'narrator.voice'");
    expect((await app.inject({ url: '/api/narrator-voice', headers: H })).json()).toMatchObject({ voice: { engine: 'chatterbox' }, chosen: false });
  });
});
