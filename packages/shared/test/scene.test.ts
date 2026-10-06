import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHANNEL_STYLES, EQUIVALENCE_FRAMES, outputJsonSchema, SceneSpecSchema, sceneRefErrors, validateArtifact, yfovFromLens,
  type SceneSpec, type Storyboard,
} from '../src/index.ts';

const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));
const scene = (): SceneSpec => fx('scene-kalem');
const board = (): Storyboard => fx('storyboard-kalem');

describe('SceneSpec', () => {
  it('accepts the pen fixture and agrees with its storyboard and style', () => {
    const v = validateArtifact('SceneSpec', scene());
    expect(v.ok).toBe(true);
    expect(sceneRefErrors(scene(), board(), 'gece_mavisi')).toEqual([]);
  });

  it('rejects broken timing, ids, frames and the M5-only asset reference', () => {
    const s = scene();
    s.frames = 1100; // inside the base range, so the refinement runs and reports the mismatch
    s.parts[1]!.id = s.parts[0]!.id;
    s.parts[2]!.explode = { ...s.parts[2]!.explode, t_start: 5, t_end: 4 };
    s.camera_keys[1]!.t = s.camera_keys[0]!.t;
    s.hero_part = 'yok';
    s.parts[3]!.asset_ref = 'polyhaven:pen';
    const v = validateArtifact('SceneSpec', s);
    expect(v.ok).toBe(false);
    const errors = v.ok ? [] : v.errors.join('\n');
    for (const m of ['frames', 'tekrarlanan parça', 't_end', 'kamera anahtarları', 'hero_part', 'varlık defteri']) expect(errors).toContain(m);
  });

  it('cross-checks duration, beat parts, the hero and the chosen channel style', () => {
    const s = scene();
    s.duration_s = 40;
    s.frames = 1200;
    s.camera_keys.at(-1)!.t = 40;
    for (const p of s.parts) p.explode = { ...p.explode, t_start: Math.min(p.explode.t_start, 30), t_end: Math.min(p.explode.t_end, 40) };
    s.parts = s.parts.filter((p) => p.id !== 'yay');
    s.hero_part = 'bilye';
    const errors = sceneRefErrors(s, board(), 'atolye').join('\n');
    expect(errors).toContain('duration_s');
    expect(errors).toContain('yay');
    expect(errors).toContain('hero_part');
    expect(errors).toContain('style_id');
  });

  it('gives the CLI a plain JSON schema (no $schema, no prefixItems)', () => {
    const js = JSON.stringify(outputJsonSchema('SceneSpec'));
    expect(js).not.toContain('$schema');
    expect(js).not.toContain('prefixItems');
    expect(JSON.parse(js).type).toBe('object');
  });

  it('derives the portrait vertical FOV from the lens (sensor fits the long side) and the five equivalence frames', () => {
    expect(yfovFromLens(36)).toBeCloseTo(2 * Math.atan(18 / 36), 10);
    expect(EQUIVALENCE_FRAMES(1350)).toEqual([0, 337, 675, 1012, 1350]);
    expect(Object.keys(CHANNEL_STYLES)).toEqual(['atolye', 'beyaz_lab', 'gece_mavisi']);
  });
});
