import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SpecStore } from '@videogen/claude';
import { buildQcReport, evaluateQc, formatClock, GENERATED_MUSIC_TITLE, qcFailures, validateArtifact, VoiceTrackSchema, type AudioPlan, type SfxName } from '@videogen/shared';
import { findArtifact, getBlob, latestArtifact, originRunId, setBestVersion, setCurrentVersion } from '@videogen/db';
import { layoutIssues, type LayoutManifest } from '@videogen/remotion/layout';
import { masterVariant, mixTrack, toFlac } from '../render/audio.ts';
import { RenderError } from '../render/driver.ts';
import { probeVideo, run } from '../render/ffmpeg.ts';
import { probeQc } from '../render/qc.ts';
import { DUCK, duckingEnvelope, GENERATED_MUSIC_LICENSE, SFX_GAIN_DB, type SoundPlan } from './sound.ts';
import { persist, record, sha, type StepDeps } from './steps.ts';
import type { StepContext, StepExecutor } from './types.ts';
import { ARTIFACT_VALIDATOR } from './validator.ts';

/**
 * Agent music design A6/A7: an audio edit's last step. The picture of the source final is copied (no render), the voice and the effects are
 * mixed again with the new music under the (possibly edited) audio plan, mastered and muxed into both variants; the stems and the audio qc are
 * recorded under the edit's version, which becomes the video's best and current version.
 */
export function remixExecutor(deps: StepDeps): StepExecutor {
  const source = async (ctx: StepContext) => {
    if (!ctx.edit) return null;
    const parent = ctx.edit.parentRunId;
    const origin = await originRunId(deps.pool, parent);
    const [tiktok, sound, layout, cover, prevAudio, originAudio] = await Promise.all(['final_video_tiktok', 'audio_plan', 'layout', 'final_cover', 'audio'].map((k) => latestArtifact(deps.pool, parent, k))
      .concat([latestArtifact(deps.pool, origin, 'audio')]));
    const stem = await latestArtifact(deps.pool, ctx.runId, 'music_stem');
    return { parent, origin, tiktok, sound, layout, cover, prevAudio: prevAudio ?? originAudio, stem };
  };
  return {
    key: 'remix',
    resource: 'heavy_cpu',
    extraDiskMb: 200,
    async inputHash(ctx) {
      const s = await source(ctx);
      const edited = await new SpecStore(join(ctx.runDir, 'spec'), ARTIFACT_VALIDATOR).read('audio');
      return sha({ step: 'remix', parent: s?.parent ?? null, video: s?.tiktok?.blobSha ?? null, stem: s?.stem?.blobSha ?? null, plan: edited?.value ?? s?.prevAudio?.content ?? null, window: ctx.duration });
    },
    async reuse(ctx, hash) {
      return !!(await findArtifact(deps.pool, { runId: ctx.runId, kind: 'final_video_tiktok', inputHash: hash }));
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const s = await source(ctx);
      if (!s) return { status: 'failed', error: 'ses düzenlemesi değil', retry: false };
      if (!s.tiktok?.blobSha || !s.sound?.content) return { status: 'failed', error: 'düzenlenecek final ya da ses planı yok', retry: false };
      if (!s.stem?.blobSha) return { status: 'failed', error: 'yeni müzik yok (music adımı çalışmadı)', retry: false };
      const path = async (sha256: string) => { const b = await getBlob(deps.pool, sha256); return b ? join(deps.dataDir, b.path) : null; };
      const videoSrc = await path(s.tiktok.blobSha);
      const musicFile = await path(s.stem.blobSha);
      if (!videoSrc || !existsSync(videoSrc) || !musicFile) return { status: 'failed', error: 'kaynak dosya yok', retry: false };

      // The plan: the composer's write_spec(audio) in this run, else the source's.
      const edited = await new SpecStore(join(ctx.runDir, 'spec'), ARTIFACT_VALIDATOR).read('audio');
      const planV = validateArtifact('AudioPlan', edited?.value ?? s.prevAudio?.content);
      const base: AudioPlan = planV.ok ? planV.value : { version: 1, mode: ctx.audioMode, music: { asset_id: null, gain_db: -18 }, vo_gain_db: 0, duck_db: 12, sfx: { gain_offset_db: 0, exclude: [] }, mastering: { target_lufs: -14, tp: -1 } };
      const plan: AudioPlan = { ...base, music: { source: 'generated', asset_id: null, gain_db: base.music.gain_db } };
      const prev = s.sound.content as SoundPlan;
      const cues = (await Promise.all(prev.cues.filter((c) => !plan.sfx.exclude.includes(c.name)).map(async (c) => {
        const a = (await deps.pool.query('SELECT blob_sha FROM assets WHERE id = $1', [c.assetId])).rows[0] as { blob_sha: string } | undefined;
        const file = a ? await path(a.blob_sha) : null;
        return file ? { ...c, gainDb: SFX_GAIN_DB[c.name as SfxName] + plan.sfx.gain_offset_db, file } : null;
      }))).filter((c): c is NonNullable<typeof c> => c !== null);

      // The voice: the origin run's stem and lines (an audio edit never changes the words or their times).
      let vo: { file: string; gainDb: number } | null = null;
      let lines: { start_ms: number; end_ms: number }[] = [];
      if (ctx.audioMode === 'vo') {
        const voice = await latestArtifact(deps.pool, s.origin, 'voice_track');
        const vt = voice ? VoiceTrackSchema.safeParse(voice.content) : null;
        const stemSha = (voice?.meta as { stemSha?: string } | null)?.stemSha;
        const file = stemSha ? await path(stemSha) : null;
        if (!vt?.success || !file) return { status: 'failed', error: 'seslendirme parçası yok', retry: false };
        vo = { file, gainDb: plan.vo_gain_db };
        lines = vt.data.lines.map((l) => ({ start_ms: l.start_ms, end_ms: l.end_ms }));
      }

      const dir = join(ctx.runDir, 'final', 'remix', hash.slice(0, 16));
      await mkdir(dir, { recursive: true });
      try {
        ctx.status('running', 'görüntü kopyalanıyor');
        const video = join(dir, 'video.mp4');
        await run(scene.ffmpeg, ['-y', '-i', videoSrc, '-an', '-c:v', 'copy', '-movflags', '+faststart', video], ctx.signal, 120_000);
        const probe = await probeVideo(scene.ffmpeg, video, ctx.signal);
        const durationS = probe.durationS;
        ctx.progress(20, 'render');
        ctx.status('running', 'ses: efektler, yeni müzik, mastering');
        const music = { file: musicFile, gainDb: plan.music.gain_db, fadeInS: 0.02 };
        const duck = vo ? duckingEnvelope(lines, { duckDb: plan.duck_db, ...DUCK }) : null;
        const out = { music: join(dir, 'final_music.mp4'), tiktok: join(dir, 'final_tiktok.mp4') };
        for (const v of ['music', 'tiktok'] as const) {
          await mixTrack(scene.ffmpeg, { cues, music: v === 'music' ? music : null, vo, duck: v === 'music' ? duck : null, durationS, out: join(dir, `mix-${v}.wav`), signal: ctx.signal });
          await masterVariant(scene.ffmpeg, join(dir, `mix-${v}.wav`), video, out[v], ctx.signal);
        }
        ctx.progress(60, 'render');
        await mixTrack(scene.ffmpeg, { cues: [], music, vo: null, duck, durationS, out: join(dir, 'stem-music.wav'), signal: ctx.signal });
        await toFlac(scene.ffmpeg, join(dir, 'stem-music.wav'), join(dir, 'stem-music.flac'), ctx.signal);
        await mixTrack(scene.ffmpeg, { cues, music: null, vo: null, duck: null, durationS, out: join(dir, 'stem-sfx.wav'), signal: ctx.signal });
        await toFlac(scene.ffmpeg, join(dir, 'stem-sfx.wav'), join(dir, 'stem-sfx.flac'), ctx.signal);

        // A7: the audio qc of the new finals (the picture is the reviewed one; G1/G5/G6 are measured again anyway).
        ctx.status('running', 'ses ölçülüyor');
        const m = await probeQc(scene.ffmpeg, out.music, { edges: !s.layout, signal: ctx.signal });
        const t = await probeQc(scene.ffmpeg, out.tiktok, { video: false, signal: ctx.signal });
        const issues = s.layout ? layoutIssues(s.layout.content as LayoutManifest) : null;
        const report = buildQcReport(evaluateQc(m, { variant: 'music', layoutIssues: issues, coverOk: !!s.cover?.blobSha, window: ctx.duration }), evaluateQc(t, { variant: 'tiktok', window: ctx.duration }));
        const sound: SoundPlan = { cues: prev.cues.filter((c) => !plan.sfx.exclude.includes(c.name)).map((c) => ({ ...c, gainDb: SFX_GAIN_DB[c.name as SfxName] + plan.sfx.gain_offset_db })), music: { assetId: null, generatedSha: s.stem.blobSha, title: GENERATED_MUSIC_TITLE, license: GENERATED_MUSIC_LICENSE, attribution: null, gainDb: plan.music.gain_db } };
        const planFile = join(dir, 'audio_plan.json');
        await writeFile(planFile, JSON.stringify(sound, null, 2));
        const qcFile = join(dir, 'qc.json');
        await writeFile(qcFile, JSON.stringify({ report, measure: { music: m, tiktok: t } }, null, 2));
        const media = { durationMs: Math.round(durationS * 1000), width: probe.width, height: probe.height, codec: probe.codec };
        await persist(deps, ctx, 'audio', plan, hash);
        await record(deps, ctx, { kind: 'audio_plan', file: planFile, content: sound, inputHash: hash });
        await record(deps, ctx, { kind: 'final_video_music', file: out.music, inputHash: hash, media, meta: { music: GENERATED_MUSIC_TITLE, audioEdit: true } });
        await record(deps, ctx, { kind: 'final_video_tiktok', file: out.tiktok, inputHash: hash, media, meta: { music: null, audioEdit: true } });
        const coverFile = s.cover?.blobSha ? await path(s.cover.blobSha) : null;
        if (coverFile) await record(deps, ctx, { kind: 'final_cover', file: coverFile, inputHash: hash });
        if (s.layout?.blobSha) { const lf = await path(s.layout.blobSha); if (lf) await record(deps, ctx, { kind: 'layout', file: lf, content: s.layout.content, inputHash: hash }); }
        await record(deps, ctx, { kind: 'stem_music', file: join(dir, 'stem-music.flac'), inputHash: hash, meta: { title: GENERATED_MUSIC_TITLE, gainDb: plan.music.gain_db, ducked: !!duck } });
        await record(deps, ctx, { kind: 'stem_sfx', file: join(dir, 'stem-sfx.flac'), inputHash: hash });
        if (vo) await record(deps, ctx, { kind: 'stem_voice', file: vo.file, inputHash: hash });
        await record(deps, ctx, { kind: 'qc_report', file: qcFile, content: report, inputHash: hash, meta: { pass: report.pass, audioEdit: true } });
        for (const f of await readdir(dir)) if (!['audio_plan.json', 'qc.json'].includes(f)) await rm(join(dir, f), { force: true });
        if (!report.gates.G1) return { status: 'failed', error: `ses düzenlemesi teslim kapısından geçmedi: ${qcFailures(report).join('; ')}`, retry: false };
        // The edit is the user's decision: its version becomes the video's best and current one (publish and the library follow it).
        if (ctx.versionId) {
          await setBestVersion(deps.pool, ctx.videoId, ctx.versionId);
          await setCurrentVersion(deps.pool, ctx.videoId, ctx.versionId);
        }
        const d6 = report.scores.D6;
        return { status: 'done', note: `ses yeniden karıştırıldı · ${formatClock(durationS)} · ${cues.length} efekt · ölçülen ses ${d6}/8${vo ? ` · ducking ${plan.duck_db} dB` : ''}` };
      } catch (e) {
        if (e instanceof RenderError && e.kind === 'aborted') return { status: 'cancelled' };
        if (e instanceof Error && /abort/i.test(e.message) && ctx.signal.aborted) return { status: 'cancelled' };
        throw e;
      }
    },
  };
}
