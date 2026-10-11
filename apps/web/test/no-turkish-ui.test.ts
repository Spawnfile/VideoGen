import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The interface is English: no Turkish letters in web source outside comments (Turkish content arrives as data, never as code). */
const ROOT = join(import.meta.dirname, '../src');
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
// Kept on purpose: Turkish product names are slugged for download file names.
const ALLOWED = [/replace\(\/[çğıöşü]\/g/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|html)$/.test(n) ? [p] : [];
  });
}

describe('English interface', () => {
  it('has no Turkish letters in web code outside comments', () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/^\s*\*.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '');
        if (TURKISH.test(code) && !ALLOWED.some((a) => a.test(code))) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
