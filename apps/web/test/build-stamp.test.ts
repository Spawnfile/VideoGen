import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stampServiceWorker } from '../build-stamp.ts';
import { isNewBuild } from '../src/lib/sw-register.ts';

describe('a new build reaches an installed app', () => {
  it('the built sw.js carries the build id in its bytes, so the browser sees a changed worker', () => {
    const src = readFileSync(join(import.meta.dirname, '../public/sw.js'), 'utf8');
    const a = stampServiceWorker(src, 'abc-1');
    const b = stampServiceWorker(src, 'abc-2');
    expect(a).toContain("const BUILD = 'abc-1';");
    expect(a).not.toEqual(b);
    expect(() => stampServiceWorker('no marker here', 'x')).toThrow();
  });

  it('the page notices a different build on the server', () => {
    expect(isNewBuild('abc-1', { build: 'abc-2' })).toBe(true);
    expect(isNewBuild('abc-1', { build: 'abc-1' })).toBe(false);
    expect(isNewBuild('abc-1', null)).toBe(false);
    expect(isNewBuild('abc-1', { nope: 1 })).toBe(false);
  });
});
