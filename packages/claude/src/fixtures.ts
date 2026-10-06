import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Msg } from './messages.ts';

export const FIXTURES_DIR = resolve(import.meta.dirname, '../../../tests/fixtures/claude-streams');
export interface FixtureLine { t: number; m: Msg }

const cache = new Map<string, FixtureLine[]>();

/** Recorded `{t, m}` NDJSON stream. Names are plain slugs: no path traversal from a dev request. */
export function loadFixture(name: string, dir = FIXTURES_DIR): FixtureLine[] {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid fixture name: ${name}`);
  const file = resolve(dir, `${name}.ndjson`);
  let lines = cache.get(file);
  if (!lines) {
    lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as FixtureLine);
    cache.set(file, lines);
  }
  return lines;
}
