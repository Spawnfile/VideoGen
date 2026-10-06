import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeProductName } from '@videogen/shared';
import type { FakeScript } from '@videogen/claude';
import type { StepContext } from './types.ts';

const DIR = resolve(import.meta.dirname, '../../../../tests/fixtures/artifacts');
const load = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8')) as Record<string, unknown>;

/** Fake driver only: recorded streams with scripted structured output. A product named "imkansız …" exercises the difficulty gate. */
export function fakePipelineScript(role: 'researcher' | 'storyboarder', ctx: StepContext, _attempt: number): FakeScript {
  if (role === 'researcher') {
    // Lower-case the Turkish way first: /i does not fold 'İ' to 'i'.
    const hard = /[iı]mk[aâ]ns[ıi]z/.test(normalizeProductName(ctx.productName));
    return { fixture: 'websearch', structured: load(hard ? 'research-too-hard' : 'research-kalem') };
  }
  const board = load('storyboard-kalem') as { beats: { onscreen_text: { tr: string } }[] };
  if (ctx.audioMode !== 'vo') return { fixture: 'basic', structured: board };
  return { fixture: 'basic', structured: { ...board, audio_mode: 'vo', beats: board.beats.map((b) => ({ ...b, vo_text: { tr: b.onscreen_text.tr } })) } };
}
