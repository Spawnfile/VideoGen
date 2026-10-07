import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getBlob, listAssets } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { ensureSfxLibrary, importAsset, parseAddArgs, SFX_NAMES } from '../src/assets.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const tmp = () => mkdtempSync(join(tmpdir(), 'vg-assets-'));
const actions = async () => (await t.pool.query("SELECT action, data FROM audit_log WHERE action LIKE 'asset.%' ORDER BY seq")).rows as { action: string; data: Record<string, unknown> }[];

describe('asset import and the procedural SFX library', () => {
  it('imports a CC-BY track with its attribution and license snapshot; a non-commercial track is stored as rejected and audited', async () => {
    const data = tmp();
    const wav = join(data, 'bed.wav');
    const { execFileSync } = await import('node:child_process');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=3:sample_rate=48000', wav]);
    const lic = join(data, 'license.txt');
    writeFileSync(lic, 'Creative Commons Attribution 4.0 International');
    const ok = await importAsset(t.pool, data, FFMPEG, { kind: 'music', file: wav, title: 'Yatak', spdx: 'CC-BY-4.0', author: 'Ada', attribution: 'Müzik: Ada (CC BY 4.0)', licenseTextFile: lic, sourceUrl: 'https://example.org/yatak' });
    expect(ok).toMatchObject({ allowed: true, kind: 'music', attribution: 'Müzik: Ada (CC BY 4.0)' });
    expect(Math.round(ok.durationMs! / 100)).toBe(30);
    expect((await getBlob(t.pool, ok.licenseSnapshotSha!))!.mime).toBe('text/plain');
    const no = await importAsset(t.pool, data, FFMPEG, { kind: 'music', file: lic, title: 'NC', spdx: 'CC-BY-NC-4.0', author: 'B', licenseTextFile: lic });
    expect(no.allowed).toBe(false);
    expect((await actions()).map((a) => a.action).slice(0, 2)).toEqual(['asset.imported', 'asset.rejected']);
    expect((await actions())[1]!.data).toMatchObject({ reason: expect.stringContaining('CC-BY-NC-4.0') });
    // The same file again with another license: the stored row and verdict stay, the audit says it exists.
    const again = await importAsset(t.pool, data, FFMPEG, { kind: 'music', file: wav, title: 'Yatak', spdx: 'CC-BY-NC-4.0', author: 'Ada', licenseTextFile: lic });
    expect(again).toMatchObject({ id: ok.id, allowed: true, licenseSpdx: 'CC-BY-4.0' });
    expect((await actions()).at(-1)).toMatchObject({ action: 'asset.exists', data: { license: 'CC-BY-4.0', allowed: true } });
  });

  it('generates six deterministic CC0 sound effects once and registers them as allowed', async () => {
    const lib = await ensureSfxLibrary(t.pool, tmp(), FFMPEG);
    expect(Object.keys(lib).sort()).toEqual([...SFX_NAMES].sort());
    expect(Object.values(lib).every((a) => a.allowed && a.licenseSpdx === 'CC0-1.0' && a.durationMs! > 0 && a.durationMs! <= 700)).toBe(true);
    const again = await ensureSfxLibrary(t.pool, tmp(), FFMPEG); // another data dir: same bytes → same blobs → no new rows
    expect(again.whoosh.blobSha).toBe(lib.whoosh.blobSha);
    expect((await listAssets(t.pool, { kind: 'sfx' })).length).toBe(6);
  });

  it('parses the CLI add command and refuses missing license fields', () => {
    expect(parseAddArgs(['--kind', 'music', '--file', 'a.mp3', '--title', 'Sakin', '--license', 'CC0-1.0', '--author', 'A', '--license-text', 'l.txt', '--tags', 'sakin,ambient']))
      .toEqual({ kind: 'music', file: 'a.mp3', title: 'Sakin', spdx: 'CC0-1.0', author: 'A', licenseTextFile: 'l.txt', tags: ['sakin', 'ambient'] });
    expect(() => parseAddArgs(['--kind', 'music', '--file', 'a.mp3'])).toThrow('eksik: --title, --license, --author, --license-text');
    expect(() => parseAddArgs(['--kind', 'video', '--file', 'a', '--title', 't', '--license', 'CC0-1.0', '--author', 'a', '--license-text', 'l'])).toThrow('--kind');
  });
});
