import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { assetUsage, createProduceRun, getAsset, insertArtifact, insertAsset, insertBlob, insertVersion, listAssets, revokeAsset } from '../src/index.ts';
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

  it('revokeAsset: sets allowed false with the time and reason once (a second revoke returns null), lists the revocation, and assetUsage counts versions whose audio plan uses the asset', async () => {
    const music = (await insertAsset(t.pool, { kind: 'music', title: 'Yatak', blobSha: await blob('d'), licenseSpdx: 'CC0-1.0', author: 'D', allowed: true }))!;
    const sfx = (await insertAsset(t.pool, { kind: 'sfx', title: 'tık', blobSha: await blob('e'), licenseSpdx: 'CC0-1.0', author: 'E', allowed: true }))!;
    expect(music).toMatchObject({ revokedAt: null, revokeReason: null });

    // Two versions play the music, one of them twice (two audio_plan rows); the SFX is in one; an unversioned plan does not count.
    const r = await createProduceRun(t.pool, { productName: 'Kullanım', audioMode: 'silent', plan: producePlan('silent') });
    const v2 = crypto.randomUUID();
    await insertVersion(t.pool, { id: v2, videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'fix:compose' });
    const plan = (cues: string[], m: string | null) => ({ cues: cues.map((assetId, k) => ({ name: 'click', atMs: k * 500, assetId, gainDb: -12 })), music: m ? { assetId: m, title: 'Yatak', license: 'CC0-1.0', attribution: null, gainDb: -20 } : null });
    await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'audio_plan', content: plan([sfx.id, sfx.id], music.id) });
    await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'audio_plan', content: plan([], music.id) });
    await insertArtifact(t.pool, { runId: r.runId, versionId: v2, kind: 'audio_plan', content: plan([], music.id) });
    await insertArtifact(t.pool, { runId: r.runId, kind: 'audio_plan', content: plan([sfx.id], null) });
    const used = await assetUsage(t.pool);
    expect([used.get(music.id), used.get(sfx.id)]).toEqual([2, 1]);

    const revoked = await revokeAsset(t.pool, music.id, 'lisans sahibi izni geri çekti');
    expect(revoked).toMatchObject({ id: music.id, allowed: false, revokeReason: 'lisans sahibi izni geri çekti' });
    expect(Date.parse(revoked!.revokedAt!)).toBeGreaterThan(Date.parse(music.createdAt));
    expect(revoked!.updatedAt).toBe(revoked!.revokedAt);
    // Conditional: a second revoke changes nothing; an unknown id is null too.
    expect(await revokeAsset(t.pool, music.id, 'ikinci')).toBeNull();
    expect(await revokeAsset(t.pool, crypto.randomUUID(), 'yok')).toBeNull();
    expect(await getAsset(t.pool, music.id)).toMatchObject({ allowed: false, revokeReason: 'lisans sahibi izni geri çekti', revokedAt: revoked!.revokedAt });
    expect((await listAssets(t.pool, { kind: 'music', allowedOnly: true })).map((x) => x.id)).not.toContain(music.id);
    expect((await listAssets(t.pool, { kind: 'music' })).find((x) => x.id === music.id)).toMatchObject({ allowed: false, revokedAt: revoked!.revokedAt });
  });
});
