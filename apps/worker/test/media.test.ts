import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { putBlob } from '../src/media.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('content-addressed media store', () => {
  it('stores by sha256 under media/sha256/ab/cd and deduplicates', async () => {
    const data = mkdtempSync(join(tmpdir(), 'vg-media-'));
    const src = join(data, 'spec.json');
    writeFileSync(src, '{"a":1}');
    const a = await putBlob(t.pool, data, src);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.path).toBe(`media/sha256/${a.sha256.slice(0, 2)}/${a.sha256.slice(2, 4)}/${a.sha256}.json`);
    expect(a).toMatchObject({ bytes: 7, mime: 'application/json', created: true });
    expect(readFileSync(join(data, a.path), 'utf8')).toBe('{"a":1}');
    const b = await putBlob(t.pool, data, src);
    expect(b).toMatchObject({ sha256: a.sha256, created: false });
    const { rows } = await t.pool.query('SELECT count(*)::int AS n FROM blobs WHERE sha256 = $1', [a.sha256]);
    expect(rows[0].n).toBe(1);
  });

  it('leaves no temp files behind and maps unknown extensions to octet-stream', async () => {
    const data = mkdtempSync(join(tmpdir(), 'vg-media-'));
    const src = join(data, 'x.weird');
    writeFileSync(src, 'zz');
    const r = await putBlob(t.pool, data, src);
    expect(r.mime).toBe('application/octet-stream');
    expect(existsSync(join(data, r.path))).toBe(true);
    const dir = join(data, 'media', 'sha256', r.sha256.slice(0, 2), r.sha256.slice(2, 4));
    expect(readFileSync(join(dir, `${r.sha256}.weird`), 'utf8')).toBe('zz');
  });
});
