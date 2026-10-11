import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Ember (spec 2026-10-11-ember-ui E2–E7): one token file carries the theme; components never spell a colour out. */
const SRC = join(import.meta.dirname, '../src');
const css = readFileSync(join(SRC, 'styles/theme.css'), 'utf8');

const PALETTE: Record<string, string> = {
  canvas: '#0A0A0C', paper: '#111114', inset: '#17171B', line: '#222228', 'line-strong': '#2E2E36',
  ink: '#EEEEF2', 'ink-2': '#A6A6B0', 'ink-3': '#7C7C88',
  hover: 'rgb(238 238 242 / 0.05)', 'hover-2': 'rgb(238 238 242 / 0.08)', scrim: 'rgb(4 4 6 / 0.62)',
  'ember-a': '#FF4D6A', 'ember-b': '#FF8A3D', accent: '#FF6B3D', 'accent-glow': '#FF9466',
  amber: '#FFC94D', red: '#F0445C', green: '#4CC38A', dim: '#5A5A64',
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('Ember theme tokens', () => {
  it('defines every Ember token with its exact value', () => {
    const missing = Object.entries(PALETTE).filter(([name, value]) => {
      const m = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
      return !m || m[1].trim().toLowerCase() !== value.toLowerCase();
    });
    expect(missing).toEqual([]);
    expect(css).toMatch(/--grad-ember:\s*linear-gradient\(100deg,\s*var\(--color-ember-a\),\s*var\(--color-ember-b\)\)/);
  });

  it('defines bg-ember, text-ember, ring-ember and label-mono utilities', () => {
    for (const u of ['bg-ember', 'text-ember', 'ring-ember', 'label-mono']) expect(css).toMatch(new RegExp(`@utility ${u}\\s*\\{`));
  });

  it('defines the eight poster tones and the frame radius', () => {
    for (let i = 0; i < 8; i++) expect(css).toMatch(new RegExp(`--poster-${i}:`));
    expect(css).toMatch(/--radius-frame:\s*6px/);
  });

  it('imports Inter 600 and 700', () => {
    expect(css).toContain('@fontsource/inter/600.css');
    expect(css).toContain('@fontsource/inter/700.css');
  });

  it('has no hex colour literal in components or routes', () => {
    const hits: string[] = [];
    for (const dir of ['components', 'routes']) {
      for (const f of files(join(SRC, dir))) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          if (/#[0-9a-fA-F]{3,8}(?=['"`\s);,])/.test(line)) hits.push(`${f.slice(SRC.length + 1)}:${i + 1}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
  it('has no bg-accent in components or routes (ember is bg-ember; selection is neutral)', () => {
    const hits: string[] = [];
    for (const dir of ['components', 'routes']) {
      for (const f of files(join(SRC, dir))) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          if (/\bbg-accent(?![-\w])/.test(line)) hits.push(`${f.slice(SRC.length + 1)}:${i + 1}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
