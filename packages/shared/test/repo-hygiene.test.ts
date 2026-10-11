import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EpisodeManifestSchema } from '../src/index.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const ALLOWED = [/^docs\/superpowers\//, /^docs\/m5\//];

function grepTracked(needle: string): string[] {
  try {
    return execFileSync('git', ['grep', '-l', '-I', needle], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) {
    if ((e as { status?: number }).status === 1) return []; // no match
    throw e;
  }
}

describe('the old episode folder is not referenced (video library L3, L4)', () => {
  it('no tracked file outside the historical docs mentions it', () => {
    expect(grepTracked(['icinde', 'ne', 'var'].join('-')).filter((f) => !ALLOWED.some((re) => re.test(f)))).toEqual([]);
  });

  it('episodes/ is outside typecheck and unit tests', () => {
    const ts = JSON.parse(readFileSync(resolve(ROOT, 'tsconfig.json'), 'utf8')) as { include: string[] };
    expect(ts.include.some((p) => p.startsWith('episodes'))).toBe(false);
    expect(readFileSync(resolve(ROOT, 'vitest.config.ts'), 'utf8')).not.toMatch(/episodes/);
  });

  it('the manifest parses, slugs are unique, and only rubik follows YAKLASIM', () => {
    const m = EpisodeManifestSchema.parse(JSON.parse(readFileSync(resolve(ROOT, 'episodes/manifest.json'), 'utf8')));
    expect(new Set(m.episodes.map((e) => e.slug)).size).toBe(m.episodes.length);
    expect(m.episodes.filter((e) => e.approach === 'yaklasim').map((e) => e.slug)).toEqual(['rubik']);
  });
});
