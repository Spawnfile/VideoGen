import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOOK_PATTERNS, outputJsonSchema, ProductResearchSchema, researchWarnings, storyboardRefErrors, StoryboardSchema, validateArtifact,
  type ProductResearch, type Storyboard,
} from '../src/artifacts.ts';

const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8')) as Record<string, unknown>;
const research = () => fx('research-kalem') as unknown as ProductResearch;
const board = () => fx('storyboard-kalem') as unknown as Storyboard;
const errs = (name: 'ProductResearch' | 'Storyboard', v: unknown) => { const r = validateArtifact(name, v); return r.ok ? [] : r.errors; };

describe('ProductResearch', () => {
  it('accepts the fixtures and requires a reason for too_hard', () => {
    expect(errs('ProductResearch', research())).toEqual([]);
    expect(errs('ProductResearch', fx('research-too-hard'))).toEqual([]);
    const { difficulty_reason_tr: _r, ...noReason } = fx('research-too-hard');
    expect(errs('ProductResearch', noReason)).toEqual(['difficulty_reason_tr: too_hard için gerekçe zorunlu']);
  });

  it('rejects duplicate ids and too few parts or claims for a buildable product', () => {
    const r = research();
    expect(errs('ProductResearch', { ...r, parts: [r.parts[0], r.parts[0], r.parts[1]] })).toContain('parts: tekrarlanan parça kimliği: govde');
    expect(errs('ProductResearch', { ...r, claims: r.claims.slice(0, 2) })).toContain('claims: en az 3 kaynaklı iddia gerekli');
    expect(ProductResearchSchema.safeParse({ ...r, parts: [{ ...r.parts[0], approx_dims_mm: [1, 2] }] }).success).toBe(false);
  });

  it('warns (does not fail) on a numeric claim with a single independent source', () => {
    const r = research();
    expect(researchWarnings(r)).toEqual([]); // the only numeric claim (bilye-capi) has a primary source
    const weak = { ...r, claims: [{ ...r.claims[0]!, sources: [r.claims[0]!.sources[0]!] }, ...r.claims.slice(1)] };
    expect(researchWarnings(weak)).toEqual(['bilye-capi: sayısal iddia için 2 bağımsız ya da 1 birincil kaynak gerekir']);
  });
});

describe('Storyboard', () => {
  it('accepts the fixture and enforces contiguous beats from 0 to duration_s', () => {
    expect(errs('Storyboard', board())).toEqual([]);
    const s = board();
    const gap = { ...s, beats: s.beats.map((b, i) => (i === 2 ? { ...b, t_start: 9.5 } : b)) };
    expect(errs('Storyboard', gap)).toEqual(["beats.2.t_start: vuruşlar bitişik olmalı (önceki 9 sn'de bitiyor)"]);
    const short = { ...s, beats: s.beats.map((b, i) => (i === 6 ? { ...b, t_end: 44 } : b)) };
    expect(errs('Storyboard', short)).toEqual(['beats: son vuruş duration_s (45) anında bitmeli']);
  });

  it('places the second hook at 40–60 % and the payoff at ≥ 70 %', () => {
    expect(errs('Storyboard', { ...board(), rehook_at: 10 })).toEqual(["rehook_at: ikinci kanca sürenin %40–60'ında olmalı"]);
    expect(errs('Storyboard', { ...board(), payoff_at: 20 })).toEqual(["payoff_at: ödül sürenin %70'inden sonra olmalı"]);
  });

  it('requires vo_text in vo mode and forbids it in silent mode; duration 35–55 s; hook pattern from the list', () => {
    const s = board();
    expect(errs('Storyboard', { ...s, audio_mode: 'vo' })).toHaveLength(7);
    expect(errs('Storyboard', { ...s, beats: s.beats.map((b) => ({ ...b, vo_text: { tr: 'x' } })) })).toHaveLength(7);
    expect(StoryboardSchema.safeParse({ ...s, duration_s: 60 }).success).toBe(false);
    expect(StoryboardSchema.safeParse({ ...s, hook: { ...s.hook, pattern: 'shock' } }).success).toBe(false);
    expect(HOOK_PATTERNS).toHaveLength(5);
  });

  it('cross-checks part and claim ids against the research', () => {
    const s = board();
    expect(storyboardRefErrors(s, research())).toEqual([]);
    const bad = { ...s, beats: s.beats.map((b, i) => (i === 1 ? { ...b, parts: [...b.parts, 'kapak'], claim_ids: ['uydurma'] } : b)) };
    expect(storyboardRefErrors(bad, research())).toEqual(['beats.1.parts: araştırmada olmayan parça: kapak', 'beats.1.claim_ids: araştırmada olmayan iddia: uydurma']);
  });
});

describe('outputJsonSchema', () => {
  it('is a plain JSON Schema object for the SDK (no $schema, no prefixItems)', () => {
    for (const name of ['ProductResearch', 'Storyboard'] as const) {
      const s = outputJsonSchema(name);
      expect(s.type).toBe('object');
      expect(s).not.toHaveProperty('$schema');
      expect(JSON.stringify(s)).not.toContain('prefixItems');
    }
    expect((outputJsonSchema('Storyboard').required as string[])).toEqual(expect.arrayContaining(['hook', 'beats', 'rehook_at', 'payoff_at']));
  });
});
