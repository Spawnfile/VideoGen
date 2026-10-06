import { describe, expect, it } from 'vitest';
import { IMPLEMENTED_STEPS, normalizeProductName, producePlan, STEP_KEYS, STEP_WEIGHTS } from '../src/pipeline.ts';

describe('produce plan', () => {
  it('keeps only implemented steps, drops voice in silent mode and rescales weights to 100', () => {
    expect(IMPLEMENTED_STEPS).toEqual(['research', 'storyboard']);
    expect(producePlan('silent')).toEqual([{ key: 'research', weight: 53.33 }, { key: 'storyboard', weight: 46.67 }]);
    const all = producePlan('vo', STEP_KEYS);
    expect(all.map((s) => s.key)).toEqual([...STEP_KEYS]);
    expect(all.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(100, 1);
    expect(producePlan('silent', STEP_KEYS).map((s) => s.key)).not.toContain('voice');
    expect(Object.values(STEP_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(normalizeProductName('  Tükenmez   KALEM ')).toBe('tükenmez kalem');
    expect(normalizeProductName('IŞIK')).toBe('ışık');
  });
});
