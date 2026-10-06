import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SpecStore } from '../src/index.ts';

describe('SpecStore concurrency (M3 minor 8)', () => {
  it('ten concurrent writers get ten distinct versions; none is overwritten', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vg-spec-'));
    const store = new SpecStore(dir);
    const res = await Promise.all(Array.from({ length: 10 }, (_, i) => store.write('scene', { i })));
    const versions = res.map((r) => ('version' in r ? r.version : -1)).sort((a, b) => a - b);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const values = await Promise.all(versions.map(async (v) => ((await store.read('scene', v))!.value as { i: number }).i));
    expect(new Set(values).size).toBe(10);
    expect(readdirSync(join(dir, 'scene')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
