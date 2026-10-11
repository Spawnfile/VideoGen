import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify, SW_RULES } from '../src/lib/sw-routes.ts';

const O = 'https://alper-pc.tailef7c0d.ts.net:8443';
const req = (path: string, o: { method?: string; mode?: string; range?: boolean; origin?: string } = {}) =>
  ({ url: `${o.origin ?? O}${path}`, method: o.method ?? 'GET', mode: o.mode ?? 'cors', range: !!o.range });

describe('service worker routing (the app shell is cached; API, live events and media never are)', () => {
  it('never answers API, live events, media ranges, writes or other origins', () => {
    expect(classify(req('/api/videos'), O)).toBe('bypass');
    expect(classify(req('/api/blobs/abc', { range: true }), O)).toBe('bypass');
    expect(classify(req('/api/blobs/abc'), O)).toBe('bypass');
    expect(classify(req('/events'), O)).toBe('bypass');
    expect(classify(req('/events?after=12'), O)).toBe('bypass');
    expect(classify(req('/api/videos', { method: 'POST' }), O)).toBe('bypass');
    expect(classify(req('/assets/index-abc.js', { origin: 'https://fonts.example' }), O)).toBe('bypass');
    expect(classify(req('/assets/index-abc.js', { range: true }), O)).toBe('bypass');
  });

  it('caches hashed assets and icons first, and serves pages network-first', () => {
    expect(classify(req('/assets/index-abc.js'), O)).toBe('asset');
    expect(classify(req('/icons/icon-192.png'), O)).toBe('asset');
    expect(classify(req('/k19/atolye.png'), O)).toBe('asset');
    expect(classify(req('/library/x', { mode: 'navigate' }), O)).toBe('shell');
    expect(classify(req('/', { mode: 'navigate' }), O)).toBe('shell');
    expect(classify(req('/api/blobs/abc', { mode: 'navigate' }), O)).toBe('bypass');
  });

  it('sw.js carries the same rule table as sw-routes.ts', () => {
    const sw = readFileSync(join(import.meta.dirname, '../public/sw.js'), 'utf8');
    expect(sw).toContain(`const RULES = ${JSON.stringify(SW_RULES)};`);
  });
});
