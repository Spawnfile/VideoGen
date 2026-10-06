import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHANNEL_STYLES, DEFAULT_CHANNEL_STYLE, normalizeProductName, type ChannelStyleId } from '@videogen/shared';
import type { FakeScript } from '@videogen/claude';
import type { PipelineRole } from './steps.ts';
import type { StepContext } from './types.ts';

const DIR = resolve(import.meta.dirname, '../../../../tests/fixtures/artifacts');
const PRODUCT = resolve(import.meta.dirname, '../../../../python/vg_blender/examples/kalem/product.py');
const load = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8')) as Record<string, unknown>;

/**
 * Fake driver only: recorded streams with scripted structured output (and, for the builder, the files it "writes").
 * "imkansız …" exercises the difficulty gate; "bozuk sahne …" makes the first build fail once (the same-session fix loop);
 * "yavaş …" keeps the builder busy (silent, CPU alive) so a test can stop a running build.
 * In a draft fix round (ctx.round ≥ 1) the builder changes the first camera lens, except for "inatçı …" (the unchanged-fix rule).
 */
export function fakePipelineScript(role: PipelineRole, ctx: StepContext, attempt: number, extra?: { styleId: ChannelStyleId }): FakeScript {
  // Lower-case the Turkish way first: /i does not fold 'İ' to 'i'.
  const name = normalizeProductName(ctx.productName);
  if (role === 'researcher') return { fixture: 'websearch', structured: load(/[iı]mk[aâ]ns[ıi]z/.test(name) ? 'research-too-hard' : 'research-kalem') };
  if (role === 'builder') {
    const styleId = extra?.styleId ?? DEFAULT_CHANNEL_STYLE;
    const broken = attempt === 0 && /bozuk sahne/.test(name) ? "# vg-fake-error: product.py satır 7: NameError: name 'gövde' is not defined\n" : '';
    const scene = load('scene-kalem') as { camera_keys: { lens_mm: number }[] };
    const fix = ctx.round > 0 && !/[iı]nat[çc][ıi]/.test(name) ? { camera_keys: scene.camera_keys.map((k, i) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 * ctx.round } : k)) } : {};
    return {
      fixture: 'coding',
      ...(/yava[şs]/.test(name) ? { stall: { afterIndex: 20, ms: 600_000, cpuPct: 20 } } : {}),
      files: { 'scene/product.py': broken + readFileSync(PRODUCT, 'utf8') },
      structured: { ...scene, ...fix, style_id: styleId, lighting_preset: CHANNEL_STYLES[styleId].lighting },
    };
  }
  const board = load('storyboard-kalem') as { beats: { onscreen_text: { tr: string } }[] };
  if (ctx.audioMode !== 'vo') return { fixture: 'basic', structured: board };
  return { fixture: 'basic', structured: { ...board, audio_mode: 'vo', beats: board.beats.map((b) => ({ ...b, vo_text: { tr: b.onscreen_text.tr } })) } };
}
