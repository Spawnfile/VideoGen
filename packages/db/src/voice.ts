import { DEFAULT_NARRATOR, NarratorVoiceSchema, type NarratorVoice } from '@videogen/shared';
import { appendAudit } from './audit.ts';
import type { Queryable } from './client.ts';

/** K17 (provisional): the narrator voice (settings `narrator.voice`); `chosen: false` = the provisional default is in use.
 *  A stored value that no longer validates (an engine or preset that was removed) counts as not chosen. */
export async function getNarratorVoice(db: Queryable): Promise<{ voice: NarratorVoice; chosen: boolean }> {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'narrator.voice'");
  const parsed = NarratorVoiceSchema.safeParse(rows[0]?.value?.voice);
  return parsed.success ? { voice: parsed.data, chosen: true } : { voice: { ...DEFAULT_NARRATOR, voice: { ...DEFAULT_NARRATOR.voice } } as NarratorVoice, chosen: false };
}

export async function setNarratorVoice(db: Queryable, voice: NarratorVoice): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('narrator.voice', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ voice, at: new Date().toISOString() })],
  );
}

/**
 * Plan M7 Y8: inside the revocation's transaction — when the narrator clones this (just revoked) reference, the setting returns to the stock voice
 * (DEFAULT_NARRATOR) and the change is audited (`settings.narrator_voice`, reason `revoked`). The row is locked against a concurrent choice.
 */
export async function resetNarratorForRevokedRef(db: Queryable, assetId: string): Promise<boolean> {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'narrator.voice' FOR UPDATE");
  const parsed = NarratorVoiceSchema.safeParse(rows[0]?.value?.voice);
  if (!parsed.success || parsed.data.voice.kind !== 'clone' || parsed.data.voice.asset_id !== assetId) return false;
  const to = { ...DEFAULT_NARRATOR, voice: { ...DEFAULT_NARRATOR.voice } } as NarratorVoice;
  await setNarratorVoice(db, to);
  await appendAudit(db, { actorType: 'user', action: 'settings.narrator_voice', subjectType: 'setting', subjectId: 'narrator.voice', data: { from: parsed.data, to, reason: 'revoked' } });
  return true;
}
