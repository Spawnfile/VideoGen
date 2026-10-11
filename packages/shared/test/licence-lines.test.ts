import { describe, expect, it } from 'vitest';
import { attributionLines } from '../src/index.ts';

const a = (id: string, o: Partial<Parameters<typeof attributionLines>[1][number]> = {}) =>
  ({ id, title: `T ${id}`, licenseSpdx: 'CC0-1.0', attribution: null, own: false, allowed: true, kind: 'sfx' as const, ...o });

describe('attribution lines of a final (video library, licence gate kept from the publish path)', () => {
  it('CC-BY assets give their attribution once; own and CC0 give none; revoked, unknown or CC-BY without attribution are refused', () => {
    const by = a('m', { licenseSpdx: 'CC-BY-4.0', attribution: 'Bed by A (CC BY 4.0)', kind: 'music' });
    expect(attributionLines({ cues: [{ assetId: 'c' }, { assetId: 'c' }], music: { assetId: 'm' } }, [a('c'), by])).toEqual({ lines: ['Bed by A (CC BY 4.0)'], refused: [] });
    expect(attributionLines({ cues: [{ assetId: 'own' }], music: null }, [a('own', { own: true, allowed: false })])).toEqual({ lines: [], refused: [] });
    expect(attributionLines({ cues: [{ assetId: 'x' }, { assetId: 'gone' }], music: null }, [a('x', { allowed: false })])).toEqual({ lines: [], refused: ['T x', 'gone'] });
    expect(attributionLines({ cues: [], music: { assetId: 'm' } }, [a('m', { licenseSpdx: 'CC-BY-4.0', attribution: null, kind: 'music' })]).refused).toEqual(['T m']);
  });
});
