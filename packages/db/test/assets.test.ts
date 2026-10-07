import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAsset, insertAsset, insertBlob, listAssets } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const blob = async (c: string) => { const sha256 = c.repeat(64); await insertBlob(t.pool, { sha256, path: `media/${sha256}.wav`, bytes: 10, mime: 'audio/wav' }); return sha256; };

describe('assets table (migration 0007)', () => {
  it('stores allowed and rejected assets, lists allowed ones by kind, and keeps one row per blob and kind', async () => {
    const a = (await insertAsset(t.pool, { kind: 'music', title: 'Sakin', blobSha: await blob('a'), licenseSpdx: 'CC0-1.0', author: 'A', allowed: true, tags: ['sakin'], durationMs: 60_000 }))!;
    await insertAsset(t.pool, { kind: 'music', title: 'NC parça', blobSha: await blob('b'), licenseSpdx: 'CC-BY-NC-4.0', author: 'B', allowed: false });
    await insertAsset(t.pool, { kind: 'sfx', title: 'whoosh', blobSha: await blob('c'), licenseSpdx: 'CC0-1.0', author: 'VideoGen (prosedürel)', allowed: true, tags: ['whoosh'] });
    expect(await insertAsset(t.pool, { kind: 'music', title: 'Aynı', blobSha: a.blobSha, licenseSpdx: 'CC0-1.0', author: 'A', allowed: true })).toBeNull();
    expect((await listAssets(t.pool, { kind: 'music', allowedOnly: true })).map((x) => x.title)).toEqual(['Sakin']);
    expect((await listAssets(t.pool, { kind: 'music' })).map((x) => x.title)).toEqual(['Sakin', 'NC parça']);
    expect(await getAsset(t.pool, a.id)).toMatchObject({ kind: 'music', allowed: true, tags: ['sakin'], durationMs: 60_000, attribution: null });
  });
});
