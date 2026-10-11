import { join } from 'node:path';
import type pg from 'pg';
import { voiceRefProblem, type AudioMode, type NarratorVoice, type StepKey } from '@videogen/shared';
import { getAsset, getBlob, getNarratorVoice, type RunContext } from '@videogen/db';
import type { AudioDriver } from '../audio/driver.ts';
import type { MusicDriver } from '../audio/music.ts';
import type { Capability } from '../render/driver.ts';

/** Plan M5c H10/H11: why a run cannot reach "Yayına hazır" is found before any LLM session is opened. Pure. */
export function preflightFor(i: { audioMode: AudioMode; plan: StepKey[]; voice: Capability; music?: Capability }): string | null {
  // YAKLASIM spec Y14: the music step's fixed generator must be there. Spec Z5: no ledger music is needed.
  if (i.plan.includes('music') && i.music && !i.music.ok) return `Müzik kullanılamıyor: ${i.music.reason}`;
  if (i.audioMode === 'vo' && i.plan.includes('voice') && !i.voice.ok) return `Seslendirme kullanılamıyor: ${i.voice.reason}`;
  return null;
}

/** The thin reader around preflightFor: the music generator's and the voice driver's capabilities. */
export function runPreflight(o: { pool: pg.Pool; audio: AudioDriver; music?: MusicDriver; narrator?: () => Promise<NarratorVoice>; dataDir?: string }): (ctx: RunContext) => Promise<string | null> {
  return async (ctx) => {
    const plan = ctx.run.plan.map((s) => s.key);
    const vo = ctx.audioMode === 'vo' && plan.includes('voice');
    return preflightFor({
      audioMode: ctx.audioMode, plan,
      voice: vo ? await voiceCapability(o) : { ok: true },
      // YAKLASIM spec Y14: a yaklasim video's music comes from the fixed generator (the audio service's Python), not FluidSynth.
      ...(plan.includes('music') && o.music ? { music: await o.music.yaklasimCapabilities() } : {}),
    });
  };
}

async function voiceCapability(o: { pool: pg.Pool; audio: AudioDriver; narrator?: () => Promise<NarratorVoice>; dataDir?: string }): Promise<Capability> {
  const narrator = await (o.narrator ?? (async () => (await getNarratorVoice(o.pool)).voice))();
  // A clone needs its reference recording on disk: the ledger row's blob.
  let refWav: string | null = null;
  if (narrator.voice.kind === 'clone') {
    const asset = await getAsset(o.pool, narrator.voice.asset_id);
    // Plan M7 Y8 (P8): a revoked or not allowed reference is refused before the driver is asked.
    const problem = voiceRefProblem(asset);
    if (problem) return { ok: false, reason: problem };
    const blob = o.dataDir ? await getBlob(o.pool, asset!.blobSha) : null;
    refWav = blob && o.dataDir ? join(o.dataDir, blob.path) : null;
  }
  return o.audio.capabilities(narrator, { refWav });
}
