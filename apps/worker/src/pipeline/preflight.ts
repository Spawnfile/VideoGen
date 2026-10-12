import type { StepKey } from '@videogen/shared';
import type { RunContext } from '@videogen/db';
import type { MusicDriver } from '../audio/music.ts';
import type { Capability } from '../render/driver.ts';

/** Plan M5c H10/H11: why a run cannot reach "Yayına hazır" is found before any LLM session is opened. Pure. */
export function preflightFor(i: { plan: StepKey[]; music?: Capability; render?: Capability }): string | null {
  // YAKLASIM spec Y14: the music step's fixed generator must be there. Spec Z1/Z5: no voice, no ledger music.
  if (i.plan.includes('music') && i.music && !i.music.ok) return `Müzik kullanılamıyor: ${i.music.reason}`;
  // Blender and ffmpeg are checked at worker start; a plan that builds a scene must not open a Claude session without them.
  if (i.plan.includes('build') && i.render && !i.render.ok) return `Render kullanılamıyor: ${i.render.reason}`;
  return null;
}

/** The thin reader around preflightFor: the music generator's capability and the render tools' (checked at worker start). */
export function runPreflight(o: { music?: MusicDriver; render?: () => Capability }): (ctx: RunContext) => Promise<string | null> {
  return async (ctx) => {
    const plan = ctx.run.plan.map((s) => s.key);
    return preflightFor({ plan, ...(plan.includes('music') && o.music ? { music: await o.music.yaklasimCapabilities() } : {}), ...(o.render ? { render: o.render() } : {}) });
  };
}
