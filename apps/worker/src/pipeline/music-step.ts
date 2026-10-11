import { join } from 'node:path';
import { sparseWindows, validateArtifact, yaklasimScore } from '@videogen/shared';
import { findArtifact, latestArtifact } from '@videogen/db';
import { briefKeys, persist, record, sha, type StepDeps } from './steps.ts';
import type { StepContext, StepExecutor, StepOutcome } from './types.ts';
import { RenderError } from '../render/driver.ts';

const SCHEMA = 'MusicScore@1';
/** The final holds frames 0…round(duration×30): one frame longer than the storyboard; a little margin for the mix's trim. */
export const musicRenderS = (durationS: number) => Math.ceil(((Math.round(durationS * 30) + 1) / 30 + 0.05) * 1000) / 1000;

/** YAKLASIM spec Y14: no composer — the fixed score from the storyboard, rendered by the YAKLASIM generator. */
async function yaklasimMusic(deps: StepDeps, ctx: StepContext, hash: string): Promise<StepOutcome> {
  const music = deps.music!;
  const cap = await music.yaklasimCapabilities();
  if (!cap.ok) return { status: 'needs_human', reason: `Müzik kullanılamıyor: ${cap.reason}` };
  const sb = await latestArtifact(deps.pool, ctx.runId, 'storyboard');
  const storyboard = sb ? validateArtifact('Storyboard', sb.content) : null;
  if (!storyboard?.ok) return { status: 'failed', error: 'storyboard yok', retry: false };
  const score = yaklasimScore(storyboard.value);
  await persist(deps, ctx, 'music', score, hash);
  const out = join(ctx.runDir, 'music', `music-${hash.slice(0, 12)}.wav`);
  const sparse = sparseWindows(score);
  try {
    const m = await music.renderYaklasim({ durationS: musicRenderS(score.duration_s), sparse, out, owner: ctx.stepId, signal: ctx.signal });
    await record(deps, ctx, { kind: 'music_stem', file: m.file, inputHash: hash, meta: { renderer: m.renderer === 'fake' ? 'fake' : 'yaklasim', notes: 0, peakDb: m.peakDb, renderS: m.durationS, bpm: score.bpm, key: score.key } });
  } catch (e) {
    if (e instanceof RenderError && e.kind === 'aborted') return { status: 'cancelled' };
    return { status: 'failed', error: `müzik üretimi: ${(e as Error).message}`, retry: true };
  }
  return { status: 'done', note: `YAKLASIM · ${score.bpm} BPM · A minör · seyrek davul: ${sparse.length} makro` };
}

/** Spec Z3: every run's music is the fixed YAKLASIM bed (no composer); CPU only, seconds. */
export function musicExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'music',
    resource: 'heavy_cpu',
    async inputHash(ctx) {
      const sb = await latestArtifact(deps.pool, ctx.runId, 'storyboard');
      return sha({ step: 'music', storyboard: sb?.id ?? null, voice: null, schema: SCHEMA, ...briefKeys(ctx, { duration: 'any' }), generator: 'yaklasim@1' });
    },
    async reuse(ctx, hash) {
      const stem = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'music_stem', inputHash: hash });
      return !!stem;
    },
    async run(ctx, hash) {
      if (!deps.music) return { status: 'needs_human', reason: 'Müzik kullanılamıyor: sentezleyici yapılandırılmadı' };
      return yaklasimMusic(deps, ctx, hash);
    },
  };
}
