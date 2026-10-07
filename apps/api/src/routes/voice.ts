import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { licenseVerdict, NarratorVoiceSchema, PRESET_VOICES, VOICE_ENGINES, type NarratorVoice, type VoiceEngine } from '@videogen/shared';
import { appendAudit, getAsset, getNarratorVoice, listAssets, setNarratorVoice } from '@videogen/db';

export interface NarratorVoiceOption { kind: 'preset' | 'clone'; id?: string; asset_id?: string; label_tr: string }
export interface NarratorVoiceState {
  voice: NarratorVoice;
  /** false: nothing chosen yet; the provisional K17 default is in use. */
  chosen: boolean;
  options: { engine: VoiceEngine; voices: NarratorVoiceOption[] }[];
}

const PRESET_LABEL: Record<string, string> = { hazir: 'Hazır ses', leyla: 'Leyla' };

/** K17 (spec §13.1 Ayarlar → anlatıcı sesi): engines, preset voices and the user's own allowed voice references; the choice. */
export function registerVoiceRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  /** A clone is only offered (and accepted) for an allowed voice_ref that passes the license rule. */
  const ownRefs = async () =>
    (await listAssets(deps.pool, { kind: 'voice_ref', allowedOnly: true })).filter((a) => licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: 'voice_ref' }).allowed);

  const state = async (): Promise<NarratorVoiceState> => {
    const refs = await ownRefs();
    return {
      ...(await getNarratorVoice(deps.pool)),
      options: VOICE_ENGINES.map((engine) => ({
        engine,
        voices: [
          ...PRESET_VOICES[engine].map((id): NarratorVoiceOption => ({ kind: 'preset', id, label_tr: PRESET_LABEL[id] ?? id })),
          // Cloning is a Chatterbox feature only (the schema refuses it for Freya).
          ...(engine === 'chatterbox' ? refs.map((a): NarratorVoiceOption => ({ kind: 'clone', asset_id: a.id, label_tr: a.title })) : []),
        ],
      })),
    };
  };

  app.get('/api/narrator-voice', async () => state());

  app.put('/api/narrator-voice', async (req, reply) => {
    const b = NarratorVoiceSchema.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'geçersiz anlatıcı sesi' });
    if (b.data.voice.kind === 'clone') {
      const a = await getAsset(deps.pool, b.data.voice.asset_id);
      if (!a || a.kind !== 'voice_ref' || !a.allowed || !licenseVerdict({ spdx: a.licenseSpdx, attribution: a.attribution, kind: 'voice_ref' }).allowed) {
        return reply.code(400).send({ error: 'klon ses için defterde izinli bir ses referansı gerekli' });
      }
    }
    const before = await getNarratorVoice(deps.pool);
    await setNarratorVoice(deps.pool, b.data);
    await appendAudit(deps.pool, { actorType: 'user', action: 'settings.narrator_voice', subjectType: 'setting', subjectId: 'narrator.voice', data: { from: before.chosen ? before.voice : null, to: b.data } });
    return state();
  });
}
