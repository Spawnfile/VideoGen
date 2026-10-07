import { join } from 'node:path';
import type pg from 'pg';
import type { AudioMode, NarratorVoice, StepKey } from '@videogen/shared';
import { getAsset, getBlob, getNarratorVoice, listAssets, type RunContext } from '@videogen/db';
import type { AudioDriver } from '../audio/driver.ts';
import type { Capability } from '../render/driver.ts';

/** Plan M5c H10/H11: why a run cannot reach "Yayına hazır" is found before any LLM session is opened. Pure. */
export function preflightFor(i: { audioMode: AudioMode; plan: StepKey[]; musicCount: number; voice: Capability }): string | null {
  // A silent video that is meant to ship (the plan reaches review) needs licensed music; developer `until` plans without review run as before.
  if (i.audioMode === 'silent' && i.plan.includes('review') && i.musicCount === 0) {
    return 'Seslendirmesiz video için izinli bir müzik parçası gerekli (node bin/assets.mjs add --kind music …) ya da Seslendirmeli kipi seçin.';
  }
  if (i.audioMode === 'vo' && i.plan.includes('voice') && !i.voice.ok) return `Seslendirme kullanılamıyor: ${i.voice.reason}`;
  return null;
}

/** The thin reader around preflightFor: allowed music from the ledger, the voice driver's capabilities for the narrator voice. */
export function runPreflight(o: { pool: pg.Pool; audio: AudioDriver; narrator?: () => Promise<NarratorVoice>; dataDir?: string }): (ctx: RunContext) => Promise<string | null> {
  return async (ctx) => {
    const plan = ctx.run.plan.map((s) => s.key);
    const vo = ctx.audioMode === 'vo' && plan.includes('voice');
    return preflightFor({
      audioMode: ctx.audioMode, plan,
      musicCount: ctx.audioMode === 'silent' ? (await listAssets(o.pool, { kind: 'music', allowedOnly: true })).length : 0,
      voice: vo ? await voiceCapability(o) : { ok: true },
    });
  };
}

async function voiceCapability(o: { pool: pg.Pool; audio: AudioDriver; narrator?: () => Promise<NarratorVoice>; dataDir?: string }): Promise<Capability> {
  const narrator = await (o.narrator ?? (async () => (await getNarratorVoice(o.pool)).voice))();
  // A clone needs its reference recording on disk: the ledger row's blob.
  let refWav: string | null = null;
  if (narrator.voice.kind === 'clone' && o.dataDir) {
    const asset = await getAsset(o.pool, narrator.voice.asset_id);
    const blob = asset ? await getBlob(o.pool, asset.blobSha) : null;
    refWav = blob ? join(o.dataDir, blob.path) : null;
  }
  return o.audio.capabilities(narrator, { refWav });
}
