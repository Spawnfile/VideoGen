import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  aigcRequired, formatClock, keepOrRetime, LINE_GAP_S, LINE_LEAD_S, retimeStoryboard, validateArtifact, voFacts, VoiceTrackSchema,
  type NarratorVoice, type Storyboard, type VoiceLine, type VoiceTrack,
} from '@videogen/shared';
import { appendAudit, findArtifact, getArtifact, getAsset, getBlob, getNarratorVoice, insertArtifact, type ArtifactRecord } from '@videogen/db';
import { fileSha256 } from '../media.ts';
import { RenderError } from '../render/driver.ts';
import { capture } from '../render/ffmpeg.ts';
import { roundCause, voiceCauseKey } from './fix-round.ts';
import { persist, record, sha, type StepDeps } from './steps.ts';
import type { StepExecutor, StepOutcome } from './types.ts';

/** Plan M5c T5 (H5, H13, H24, H25): TTS + alignment under the GPU lock, the storyboard retimed to the real lines, the voice track and its stem. */

/** The engine pins of python/audio_service/PINS.md (first 8 chars as in tts.py MODEL_NAMES); part of the step's input hash. */
export const CHATTERBOX_PIN = 'chatterbox-multilingual-v3@5de7a54a';
export const FREYA_PIN = 'freya-tts@146d36c1';

const LEAD_MS = Math.round(LINE_LEAD_S * 1000);
const GAP_MS = Math.round(LINE_GAP_S * 1000);

/** H4: what a voice track is tied to: every beat's id, vo_text and times plus the video length. Compose compares this, not storyboard row ids. */
export function voKey(s: Storyboard): string {
  return sha({ beats: s.beats.map((b) => [b.id, b.vo_text?.tr ?? null, b.t_start, b.t_end]), duration_s: s.duration_s });
}

/** Per-line seed (H5): attempt k uses seed + 1000 k inside the CLI. */
export const lineSeed = (runId: string, beatId: string): number => parseInt(sha([runId, beatId]).slice(0, 8), 16);

/** The kind of `voice_track.meta` (plan H4); `voiceHash` is null when the beats were kept (no retimed storyboard written). */
export interface VoiceTrackMeta { fixRound: number; rebuild: boolean; sourceStoryboardId: string; voKey: string; stemSha: string; voiceHash: string | null }

export interface VoiceSource { source: ArtifactRecord & { value: Storyboard }; narrator: NarratorVoice; /** false: the provisional default voice (K17). */ chosen: boolean; refWav: string | null }

/** H5: the source is the newest storyboard the voice step did not write itself (`meta.retimedFrom` absent). */
export async function voiceSource(deps: Pick<StepDeps, 'pool' | 'dataDir'>, runId: string): Promise<VoiceSource | null> {
  const { rows } = await deps.pool.query("SELECT id FROM artifacts WHERE run_id = $1 AND kind = 'storyboard' AND meta->>'retimedFrom' IS NULL ORDER BY created_at DESC LIMIT 1", [runId]);
  if (!rows[0]) return null;
  const full = await getArtifact(deps.pool, rows[0].id);
  const v = full ? validateArtifact('Storyboard', full.content) : null;
  if (!full || !v?.ok) return null;
  const { voice: narrator, chosen } = await getNarratorVoice(deps.pool);
  let refWav: string | null = null;
  if (narrator.voice.kind === 'clone') {
    const asset = await getAsset(deps.pool, narrator.voice.asset_id);
    const blob = asset ? await getBlob(deps.pool, asset.blobSha) : null;
    refWav = blob ? join(deps.dataDir, blob.path) : null;
  }
  const source = { ...full, value: v.value };
  return { source, narrator, chosen, refWav };
}

const pct = (cer: number) => (cer * 100).toFixed(1).replace('.', ',');
/** Display label, the same wording as the Voice card ("Chatterbox · hazır ses", "Freya · Leyla", "Chatterbox · klon ses"). */
const voiceLabel = (n: NarratorVoice) => {
  const engine = n.engine === 'freya' ? 'Freya' : 'Chatterbox';
  const who = n.voice.kind === 'clone' ? 'klon ses' : n.voice.id === 'hazir' ? 'hazır ses' : n.voice.id === 'leyla' ? 'Leyla' : n.voice.id;
  return `${engine} · ${who}`;
};

/** Spec §7.6 step 4: the lines at their placed moments (adelay + amix without normalisation), one single-pass (dynamic mode) loudnorm to −16 LUFS, FLAC 48 kHz mono, padded to the video length (atrim by sample: loudnorm shifts the timestamps, a time-based trim ends 80 ms short). */
export async function buildStem(ffmpeg: string, o: { lines: { file: string; startMs: number }[]; durationS: number; out: string; signal?: AbortSignal }): Promise<void> {
  const args = ['-v', 'error', '-y'];
  for (const l of o.lines) args.push('-i', l.file);
  const parts = o.lines.map((l, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=mono,adelay=${l.startMs}:all=1[l${i}]`);
  const mix = `${o.lines.map((_, i) => `[l${i}]`).join('')}amix=inputs=${o.lines.length}:normalize=0:duration=longest`;
  parts.push(`${mix},loudnorm=I=-16:TP=-3:LRA=11,aresample=48000,apad,atrim=end_sample=${Math.round(o.durationS * 48000)}[out]`);
  await capture(ffmpeg, [...args, '-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '1', '-c:a', 'flac', o.out], o.signal);
}

async function stemPresent(deps: StepDeps, track: ArtifactRecord | null): Promise<boolean> {
  const stem = track ? await deps.pool.query("SELECT blob_sha FROM artifacts WHERE run_id = $1 AND kind = 'voice_stem' AND input_hash = $2 ORDER BY created_at DESC LIMIT 1", [track.runId, track.inputHash]) : null;
  const blob = stem?.rows[0]?.blob_sha ? await getBlob(deps.pool, stem.rows[0].blob_sha) : null;
  return !!blob && existsSync(join(deps.dataDir, blob.path));
}

/** The CER gate of the voice CLI (job.json `cer_max`): a returned line over it counts as failed even when the CLI did not list it. */
const CER_MAX = 0.05;

/**
 * Spec §7.1 step 3 (M5c): GPU step; the orchestrator holds the lock and checks §6.4 with the stem's disk estimate.
 * `hooks` are for tests only: `stem` replaces the ffmpeg mix (~0.7 s per 45 s stem), `afterStoryboard` runs between the retimed storyboard and the
 * track (a crash there), `pin` overrides the engine pins of the input hash.
 */
export function voiceExecutor(deps: StepDeps, hooks: { stem?: typeof buildStem; afterStoryboard?: () => void | Promise<void>; pin?: { chatterbox: string; freya: string } } = {}): StepExecutor {
  const hashOf = async (ctx: Parameters<StepExecutor['inputHash']>[0]) => {
    const src = await voiceSource(deps, ctx.runId);
    if (!src) return sha({ step: 'voice', missing: true });
    // `rebuild` is a result of this step and stays out of the hash (voiceCauseKey): a restart before settle would otherwise write a second track.
    const cause = ctx.fixRound > 0 ? await roundCause(deps.pool, ctx.runId, ctx.fixRound) : null;
    return sha({
      step: 'voice', source: src.source.id, narrator: src.narrator, pin: hooks.pin ?? { chatterbox: CHATTERBOX_PIN, freya: FREYA_PIN }, lead: LINE_LEAD_S, gap: LINE_GAP_S,
      ...(ctx.fixRound > 0 ? { fixRound: ctx.fixRound, cause: voiceCauseKey(cause) } : {}),
    });
  };
  return {
    key: 'voice',
    resource: 'gpu',
    extraDiskMb: 200,
    inputHash: hashOf,
    async reuse(ctx, hash) {
      const track = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'voice_track', inputHash: hash });
      const src = await voiceSource(deps, ctx.runId);
      const m = track?.meta as Partial<VoiceTrackMeta> | undefined;
      if (!track || !src || m?.sourceStoryboardId !== src.source.id || !(await stemPresent(deps, track))) return false;
      if (!m.voiceHash) return true;
      const { rows } = await deps.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'storyboard' AND meta->>'retimedFrom' = $2 AND meta->>'voiceHash' = $3 LIMIT 1", [ctx.runId, src.source.id, m.voiceHash]);
      return rows.length > 0;
    },
    async run(ctx, hash): Promise<StepOutcome> {
      if (ctx.audioMode !== 'vo') return { status: 'failed', error: 'seslendirmesiz videoda voice adımı olmaz', retry: false };
      const audio = deps.audio;
      if (!audio) return { status: 'failed', error: 'seslendirme yapılandırılmadı', retry: false };
      const src = await voiceSource(deps, ctx.runId);
      if (!src) return { status: 'failed', error: 'storyboard çıktısı yok', retry: false };
      const { source, narrator } = src;
      const sb = source.value;
      const cause = ctx.fixRound > 0 ? await roundCause(deps.pool, ctx.runId, ctx.fixRound) : null;
      const voiceRound = ctx.fixRound > 0 && cause?.kind !== 'rework';

      // (2) one line per beat; the real CLI ignores targetMs, the fake lasts exactly this (beat − lead − gap).
      const lines = sb.beats.map((b) => ({ id: b.id, text: b.vo_text?.tr ?? '', targetMs: Math.max(200, Math.round((b.t_end - b.t_start) * 1000) - LEAD_MS - GAP_MS), seed: lineSeed(ctx.runId, b.id) }));
      const voiceDir = join(ctx.runDir, 'voice');
      const outDir = join(voiceDir, hash.slice(0, 16));
      await mkdir(outDir, { recursive: true });
      let out;
      try {
        out = await audio.voice({
          runDir: ctx.runDir, outDir, cacheDir: join(voiceDir, 'cache'), owner: ctx.stepId, narrator, refWav: src.refWav, lines, signal: ctx.signal,
          onProgress: (done, total) => ctx.progress(Math.min(90, (done / Math.max(1, total)) * 90), 'render'),
        });
      } catch (e) {
        if (e instanceof RenderError && e.kind !== 'aborted') return { status: 'failed', error: e.message, retry: false };
        throw e;
      }

      // (4) H25: a line over the CER gate after the retries is the user's decision.
      // Defensive: a line over the gate in the result counts even when `failed` does not list it.
      const failedIds = [...new Set([...out.failed, ...out.lines.filter((l) => l.cer > CER_MAX).map((l) => l.id)])];
      if (failedIds.length) {
        const bad = failedIds.map((id) => `vuruş ${id}, CER %${pct(out.lines.find((l) => l.id === id)?.cer ?? 0)}`).join('; ');
        const tries = Math.max(...failedIds.map((id) => out.lines.find((l) => l.id === id)?.attempts ?? 3));
        return { status: 'needs_human', reason: `seslendirme anlaşılmıyor: ${bad} (${tries} denemeden sonra); Ayarlar'dan anlatıcı sesini değiştirebilir ya da vo_text'i sadeleştirebilirsiniz` };
      }
      const byId = new Map(out.lines.map((l) => [l.id, l]));
      const ordered = sb.beats.map((b) => byId.get(b.id));
      if (ordered.some((l) => !l)) return { status: 'failed', error: 'seslendirme sonucunda eksik satır var', retry: false };
      const done = ordered as NonNullable<(typeof ordered)[number]>[];
      const durations = done.map((l) => l.durationMs);

      // (5) first pass and rework always retime; a voice round keeps the beat times when the new lines fit (H13).
      const k = voiceRound ? keepOrRetime(sb, durations) : null;
      const kept = !!k?.keep;
      let finalSb = sb;
      let maxShiftS = 0;
      let starts: number[];
      if (k?.keep) starts = k.starts_ms;
      else {
        const r = retimeStoryboard(sb, durations);
        if ('error' in r) return { status: 'needs_human', reason: r.error };
        finalSb = r.storyboard; starts = r.starts_ms; maxShiftS = r.maxShiftS;
      }
      const durationS = finalSb.duration_s;

      // (6) the stem.
      const stemFile = join(outDir, 'stem.flac');
      try {
        await (hooks.stem ?? buildStem)(deps.scene?.ffmpeg ?? 'ffmpeg', { lines: done.map((l, i) => ({ file: l.wav, startMs: starts[i]! })), durationS, out: stemFile, signal: ctx.signal });
      } catch (e) {
        if (ctx.signal.aborted) return { status: 'cancelled' };
        return { status: 'failed', error: `ses karışımı başarısız: ${(e as Error).message}`, retry: false };
      }

      // The track: absolute lines and word times.
      const voiceLines: VoiceLine[] = done.map((l, i) => ({
        beat_id: l.id, text_tr: lines[i]!.text, normalized_tr: l.normalized || lines[i]!.text, start_ms: starts[i]!, end_ms: starts[i]! + l.durationMs,
        seed: l.seed, attempts: l.attempts, cer: l.cer, asr_tr: l.asr.slice(0, 600),
      }));
      const words = done.flatMap((l, i) => l.words.map((w) => {
        const start = Math.min(starts[i]! + w.startMs, voiceLines[i]!.end_ms - 1);
        return { text: w.text.slice(0, 80), start_ms: start, end_ms: Math.max(start, Math.min(starts[i]! + w.endMs, voiceLines[i]!.end_ms)), beat_id: l.id };
      }));
      const track: VoiceTrack = {
        lines: voiceLines, words, duration_ms: Math.max(Math.round(durationS * 1000), voiceLines.at(-1)!.end_ms),
        provider: { engine: narrator.engine, model: out.model, voice: narrator.voice, aigc_label: aigcRequired(narrator) },
        facts: voFacts(voiceLines, words),
      };
      const parsed = VoiceTrackSchema.safeParse(track);
      if (!parsed.success) return { status: 'failed', error: `ses izi geçersiz: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, retry: false };

      // (7) write order (H5): stem blob → retimed storyboard → the track last (the commit mark).
      // A restart rebuilds the same stem: the row of the earlier attempt stays the only one.
      const builtSha = await fileSha256(stemFile);
      const had = await deps.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'voice_stem' AND input_hash = $2 AND blob_sha = $3 LIMIT 1", [ctx.runId, hash, builtSha]);
      if (!had.rows.length) await record(deps, ctx, { kind: 'voice_stem', file: stemFile, inputHash: hash });
      const stemSha = builtSha!;
      let voiceHash: string | null = null;
      if (!kept) {
        voiceHash = sha({ source: source.id, storyboard: finalSb });
        const { rows } = await deps.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'storyboard' AND meta->>'voiceHash' = $2 LIMIT 1", [ctx.runId, voiceHash]);
        if (!rows.length) await persist(deps, ctx, 'storyboard', finalSb, hash, { meta: { retimedFrom: source.id, maxShiftS, voiceHash } });
      }
      await hooks.afterStoryboard?.();
      const rebuild = voiceRound && !kept;
      const meta: VoiceTrackMeta = { fixRound: ctx.fixRound, rebuild, sourceStoryboardId: source.id, voKey: voKey(finalSb), stemSha, voiceHash };
      const a = await insertArtifact(deps.pool, { runId: ctx.runId, stepId: ctx.stepId, versionId: ctx.versionId, kind: 'voice_track', content: parsed.data, inputHash: hash, meta });
      await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: ctx.runId, stepId: ctx.stepId, subjectType: 'artifact', subjectId: a.id, data: { kind: 'voice_track' } });
      await appendAudit(deps.pool, {
        actorType: 'orchestrator', action: 'voice.synthesized', runId: ctx.runId, stepId: ctx.stepId,
        data: { engine: narrator.engine, voice: narrator.voice, lines: done.length, attempts: done.reduce((n, l) => n + l.attempts, 0), maxCer: parsed.data.facts.max_cer, ms: out.ms },
      });
      await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'voice.retimed', runId: ctx.runId, stepId: ctx.stepId, data: { maxShiftS, rebuild } });

      // (8)
      return {
        status: 'done',
        note: `${done.length} satır · ${formatClock(durationS)} · en kötü CER %${pct(parsed.data.facts.max_cer)} · ${voiceLabel(narrator)}${src.chosen ? '' : ' · GEÇİCİ ses (K17)'}${kept ? ' · vuruşlar korundu' : ''}`,
      };
    },
  };
}
