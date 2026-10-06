import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIGHTING_PRESETS, MATERIAL_PRESETS, PRIMITIVES } from '../src/index.ts';

const py = (f: string) => readFileSync(resolve(import.meta.dirname, '../../../python/vg_blender/vg_blender', f), 'utf8');
const keysOf = (src: string, name: string) => {
  const body = new RegExp(`^${name} = \\{([\\s\\S]*?)^\\}`, 'm').exec(src)?.[1] ?? '';
  return [...body.matchAll(/^\s+"([a-z_]+)":/gm)].map((m) => m[1]).sort();
};

describe('vg_blender ↔ shared contracts', () => {
  it('material presets, lighting presets and primitives have the same names on both sides', () => {
    expect(keysOf(py('materials.py'), 'PRESETS')).toEqual([...MATERIAL_PRESETS].sort());
    expect(keysOf(py('stage.py'), 'LIGHTING')).toEqual([...LIGHTING_PRESETS].sort());
    const api = py('api.py');
    for (const p of PRIMITIVES) expect(api, p).toMatch(new RegExp(`\\n    def ${p}\\(self`));
  });
});
