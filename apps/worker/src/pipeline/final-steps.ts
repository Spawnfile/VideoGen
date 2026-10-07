import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildQcReport, CHANNEL_STYLES, evaluateQc, formatClock, QC_CHECKS, qcFailures, QcReportSchema, RUBRIC_VERSION, SceneEventsSchema, validateArtifact, type QcReport,
} from '@videogen/shared';
import { appendAudit, findArtifact, getBlob, insertArtifact, latestArtifact, listAssets } from '@videogen/db';
import { parseGlb } from '@videogen/scene3d';
import { bundleHash, FINAL_MASTER } from '@videogen/remotion/hash';
import { finalProps, type FinalProps } from '@videogen/remotion/props';
import { layoutIssues, layoutManifest, type LayoutManifest } from '@videogen/remotion/layout';
import { ensureSfxLibrary } from '../assets.ts';
import { masterVariant, mixTrack } from '../render/audio.ts';
import { RenderError } from '../render/driver.ts';
import { draftProbeErrors, encodeDelivery, extractFrame, FINAL_ENCODE, probeVideo } from '../render/ffmpeg.ts';
import { missingFrames } from '../render/frames.ts';
import { probeQc } from '../render/qc.ts';
import { LicenseError, pickMusic, planSfx, soundPlan, type SoundPlan } from './sound.ts';
import { record, sha, type StepDeps } from './steps.ts';
import type { StepExecutor, StepOutcome } from './types.ts';

/** Fixed final render parameters (spec §7.5; part of the §8.3 input hash). The .blend carries the EEVEE settings (stage.configure). */
export const FINAL_RENDER = { engine: 'BLENDER_EEVEE', samples: 64, raytracing: true, view: 'AgX Punchy', width: 1080, height: 1920, fps: 30, frames: 'png-rgba8' } as const;

/** `final_frames` artifact meta (plan E6): the frames stay in the run directory, never in the blob store. */
export interface FinalFramesMeta { dir: string; frames: number; skipped: number; samples: number; renderer: string; renderMs: number }

/** Plan E16: the latest scene .blend and spec of the run, and the final render's input hash. */
export async function finalSource(deps: Pick<StepDeps, 'pool' | 'dataDir'>, runId: string): Promise<{ hash: string; blendPath: string; blendSha: string; specHash: string; lastFrame: number } | null> {
  const [blend, scene] = await Promise.all(['scene_blend', 'scene'].map((k) => latestArtifact(deps.pool, runId, k)));
  const s = scene ? validateArtifact('SceneSpec', scene.content) : null;
  const blob = blend?.blobSha ? await getBlob(deps.pool, blend.blobSha) : null;
  if (!s?.ok || !blob) return null;
  const specHash = sha(s.value);
  return { hash: sha({ step: 'final_render', blend: blob.sha256, spec: specHash, style: s.value.style_id, render: FINAL_RENDER }), blendPath: join(deps.dataDir, blob.path), blendSha: blob.sha256, specHash, lastFrame: s.value.frames };
}

/** Spec §7.1 step 7: Blender final frames. GPU: the orchestrator holds the lock and checks §6.4 with the frames' disk estimate. */
export function finalRenderExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'final_render',
    resource: 'gpu',
    extraDiskMb: 2000,
    async inputHash(ctx) {
      return (await finalSource(deps, ctx.runId))?.hash ?? sha({ step: 'final_render', missing: true });
    },
    async reuse(ctx, hash) {
      const a = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'final_frames', inputHash: hash });
      const m = a?.meta as FinalFramesMeta | undefined;
      return !!m && missingFrames(join(ctx.runDir, m.dir), m.frames - 1).length === 0;
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const src = await finalSource(deps, ctx.runId);
      if (!src) return { status: 'failed', error: "sahne çıktısı yok (.blend ya da sahne spec'i)", retry: false };
      const rel = join('final', hash.slice(0, 16));
      const work = join(ctx.runDir, rel);
      await mkdir(work, { recursive: true });
      const blend = join(work, 'scene.blend');
      await copyFile(src.blendPath, blend);
      try {
        const r = await scene.render.final({
          runDir: ctx.runDir, blendPath: blend, outDir: join(work, 'frames'), lastFrame: src.lastFrame, owner: ctx.stepId, signal: ctx.signal,
          onProgress: (done, total) => ctx.progress(Math.min(99, (done / total) * 100), 'render'),
        });
        const meta: FinalFramesMeta = { dir: join(rel, 'frames'), frames: r.frames, skipped: r.skipped, samples: r.samples, renderer: r.renderer, renderMs: r.ms };
        const a = await insertArtifact(deps.pool, { runId: ctx.runId, stepId: ctx.stepId, versionId: ctx.versionId, kind: 'final_frames', inputHash: hash, meta });
        await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: ctx.runId, stepId: ctx.stepId, subjectType: 'artifact', subjectId: a.id, data: { kind: 'final_frames', frames: r.frames, skipped: r.skipped } });
        return { status: 'done', note: `${r.frames} kare · EEVEE ${r.samples} örnek · ${Math.round(r.ms / 60_000)} dk${r.skipped ? ` · ${r.skipped} kare önceden hazırdı` : ''}` };
      } catch (e) {
        if (e instanceof RenderError && e.kind !== 'aborted') return { status: 'failed', error: e.message, retry: false };
        throw e;
      }
    },
  };
}

export interface ComposeSource {
  hash: string;
  /** final_frames' input hash vs. the hash of the current scene (plan E16: stale frames are never composed). */
  framesHash: string;
  currentFramesHash: string;
  framesDir: string;
  glbPath: string;
  props: Omit<FinalProps, 'glbUrl' | 'framesUrl'>;
  durationS: number;
  sound: SoundPlan;
  files: Map<string, string>;
}

/** Plan E16: everything compose reads, and its input hash (frames, GLB, overlay props, template, master/encode settings, sound plan). */
export async function composeSource(deps: StepDeps, runId: string, videoId: string): Promise<ComposeSource | { error: string } | null> {
  const ffmpeg = deps.scene?.ffmpeg ?? 'ffmpeg';
  const [frames, glb, scene, board, track, events] = await Promise.all(['final_frames', 'scene_glb', 'scene', 'storyboard', 'camera_track', 'scene_events'].map((k) => latestArtifact(deps.pool, runId, k)));
  const current = await finalSource(deps, runId);
  const s = scene ? validateArtifact('SceneSpec', scene.content) : null;
  const b = board ? validateArtifact('Storyboard', board.content) : null;
  const ev = events ? SceneEventsSchema.safeParse(events.content) : null;
  const yfov = (track?.content as { yfov?: number[] } | null)?.yfov;
  const glbBlob = glb?.blobSha ? await getBlob(deps.pool, glb.blobSha) : null;
  const meta = frames?.meta as FinalFramesMeta | undefined;
  if (!frames?.inputHash || !meta || !current || !s?.ok || !b?.ok || !ev?.success || !yfov || !glbBlob) return null;
  const { glbUrl: _g, framesUrl: _f, ...props } = finalProps({ glbUrl: '', framesUrl: '', yfov, scene: s.value, storyboard: b.value, style: CHANNEL_STYLES[s.value.style_id] });
  const durationS = (props.frames + 1) / 30;
  const library = await ensureSfxLibrary(deps.pool, deps.dataDir, ffmpeg);
  const music = pickMusic(await listAssets(deps.pool, { kind: 'music', allowedOnly: true }), videoId);
  let sound: SoundPlan;
  try {
    sound = soundPlan(planSfx({ events: ev.data.events, beats: b.value.beats, fps: 30, durationS }), library, music);
  } catch (e) {
    if (e instanceof LicenseError) return { error: `lisans kapısı: ${e.message}` };
    throw e;
  }
  const files = new Map<string, string>();
  for (const a of [...Object.values(library), ...(music ? [music] : [])]) files.set(a.id, join(deps.dataDir, (await getBlob(deps.pool, a.blobSha))!.path));
  const hash = sha({ step: 'compose', frames: frames.inputHash, glb: glbBlob.sha256, props: sha(props), bundle: bundleHash(), master: FINAL_MASTER, encode: FINAL_ENCODE, preset: deps.scene?.encodePreset ?? 'slow', sound: sha(sound) });
  return { hash, framesHash: frames.inputHash, currentFramesHash: current.hash, framesDir: meta.dir, glbPath: join(deps.dataDir, glbBlob.path), props, durationS, sound, files };
}

/** Spec §7.1 step 8: Final3D over the frames → delivery encode → SFX + music + mastering → the two variants (plan E7–E12). heavy_cpu. */
export function composeExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'compose',
    resource: 'heavy_cpu',
    extraDiskMb: 600,
    async inputHash(ctx) {
      const src = await composeSource(deps, ctx.runId, ctx.videoId);
      return src && 'hash' in src ? src.hash : sha({ step: 'compose', missing: true, error: src && 'error' in src ? src.error : null });
    },
    async reuse(ctx, hash) {
      const a = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'final_video_tiktok', inputHash: hash });
      const blob = a?.blobSha ? await getBlob(deps.pool, a.blobSha) : null;
      return !!blob && existsSync(join(deps.dataDir, blob.path));
    },
    async run(ctx) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const src = await composeSource(deps, ctx.runId, ctx.videoId);
      if (!src) return { status: 'failed', error: 'final kareleri ya da sahne çıktısı yok', retry: false };
      if ('error' in src) return { status: 'failed', error: src.error, retry: false };
      // One source for the whole step: a music track imported after inputHash() must not mix two plans under one hash.
      const hash = src.hash;
      if (src.framesHash !== src.currentFramesHash) return { status: 'failed', error: 'final kareler güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false };
      const framesDir = join(ctx.runDir, src.framesDir);
      const missing = missingFrames(framesDir, src.props.frames);
      if (missing.length) return { status: 'failed', error: `eksik final kare: ${missing.length} (ilk: f${String(missing[0]).padStart(5, '0')})`, retry: false };
      const dir = join(ctx.runDir, 'final', 'compose', hash.slice(0, 16));
      await mkdir(dir, { recursive: true });
      const layout = layoutManifest(src.props, await parseGlb(await readFile(src.glbPath)));
      const layoutFile = join(dir, 'layout.json');
      await writeFile(layoutFile, JSON.stringify(layout));
      try {
        ctx.status('running', 'birleştirme hazırlanıyor (bundle, Chrome)');
        const r = await scene.render.compose({
          runDir: ctx.runDir, props: src.props, glbPath: src.glbPath, framesDir, outPath: join(dir, 'master.mp4'), owner: ctx.stepId, signal: ctx.signal,
          onStage: (st) => { if (st === 'frames') ctx.status('running', null); },
          onProgress: (done, total) => ctx.progress(Math.min(80, (done / total) * 80), 'render'),
        });
        ctx.status('running', 'teslim kodlaması');
        const video = join(dir, 'video.mp4');
        await encodeDelivery(scene.ffmpeg, r.file, video, { preset: scene.encodePreset ?? 'slow', signal: ctx.signal });
        const probe = await probeVideo(scene.ffmpeg, video, ctx.signal);
        const errors = draftProbeErrors(probe, { width: 1080, height: 1920, frames: src.props.frames + 1 });
        if (errors.length) {
          await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'render.final_rejected', runId: ctx.runId, stepId: ctx.stepId, data: { errors } });
          return { status: 'failed', error: `final video doğrulamadan geçmedi: ${errors.join('; ')}`, retry: false };
        }
        ctx.progress(85, 'render');
        ctx.status('running', 'ses: efektler, müzik, mastering');
        const cues = src.sound.cues.map((c) => ({ atMs: c.atMs, gainDb: c.gainDb, file: src.files.get(c.assetId)! }));
        const music = src.sound.music ? { file: src.files.get(src.sound.music.assetId)!, gainDb: src.sound.music.gainDb } : null;
        const out: Record<'music' | 'tiktok', string> = { music: join(dir, 'final_music.mp4'), tiktok: join(dir, 'final_tiktok.mp4') };
        for (const v of ['music', 'tiktok'] as const) {
          await mixTrack(scene.ffmpeg, { cues, music: v === 'music' ? music : null, durationS: src.durationS, out: join(dir, `mix-${v}.wav`), signal: ctx.signal });
          await masterVariant(scene.ffmpeg, join(dir, `mix-${v}.wav`), video, out[v], ctx.signal);
        }
        ctx.status('running', null);
        ctx.progress(95, 'render');
        const cover = join(dir, 'cover.png');
        await extractFrame(scene.ffmpeg, video, cover, { t: 0, width: 540, signal: ctx.signal });
        const planFile = join(dir, 'audio_plan.json');
        await writeFile(planFile, JSON.stringify(src.sound, null, 2));
        const media = { durationMs: Math.round(probe.durationS * 1000), width: probe.width, height: probe.height, codec: probe.codec };
        await record(deps, ctx, { kind: 'layout', file: layoutFile, content: layout, inputHash: hash });
        await record(deps, ctx, { kind: 'audio_plan', file: planFile, content: src.sound, inputHash: hash });
        await record(deps, ctx, { kind: 'final_video_music', file: out.music, inputHash: hash, media, meta: { music: src.sound.music?.title ?? null, framesHash: src.framesHash } });
        await record(deps, ctx, { kind: 'final_video_tiktok', file: out.tiktok, inputHash: hash, media, meta: { music: null, framesHash: src.framesHash } });
        await record(deps, ctx, { kind: 'final_cover', file: cover, inputHash: hash });
        await removeIntermediates(dir);
        return { status: 'done', note: `1080×1920 · ${formatClock(probe.durationS)} · ${src.sound.cues.length} efekt · müzik: ${src.sound.music?.title ?? 'yok'}` };
      } catch (e) {
        if (e instanceof RenderError && e.kind !== 'aborted') return { status: 'failed', error: e.message, retry: false };
        throw e;
      }
    },
  };
}

/** Plan E15: gates decide (needs_human until the fixer of M5b); the D6/D7 checks that cost points go into the note. */
export function decideQc(r: QcReport, musicTitle: string | null): StepOutcome {
  if (!r.pass) return { status: 'needs_human', reason: `Otomatik kontrol geçmedi: ${qcFailures(r).join('; ')}.` };
  const soft = r.music.filter((c) => !c.pass && QC_CHECKS[c.id].points > 0).map((c) => `${QC_CHECKS[c.id].label_tr} ${c.value}`);
  return {
    status: 'done',
    note: `G1 ✓ G5 ✓ G6 ✓ · D6 ${r.scores.D6}/12 · D7 ${r.scores.D7}/5${soft.length ? ` · ${soft.join(', ')}` : ''}${musicTitle ? '' : ' · müzik defterinde izinli parça yok (bin/assets.mjs add)'}`,
  };
}

/** Spec §7.1 step 9 / §8.2 AUTO + MANIFEST: qc_probe on both variants, layout.json for G6, the report and the decision. heavy_cpu. */
export function qcExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'qc',
    resource: 'heavy_cpu',
    async inputHash(ctx) {
      const [m, t] = await Promise.all(['final_video_music', 'final_video_tiktok'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
      return sha({ step: 'qc', music: m?.blobSha ?? null, tiktok: t?.blobSha ?? null, rubric: RUBRIC_VERSION });
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const music = await latestArtifact(deps.pool, ctx.runId, 'final_video_music');
      // The variant, cover and layout of the same compose (same input hash), not merely the latest rows.
      const [tiktok, cover, layout] = music?.inputHash
        ? await Promise.all(['final_video_tiktok', 'final_cover', 'layout'].map((kind) => findArtifact(deps.pool, { runId: ctx.runId, kind, inputHash: music.inputHash! })))
        : [null, null, null];
      if (!music?.blobSha || !tiktok?.blobSha) return { status: 'failed', error: 'denetlenecek final video yok', retry: false };
      // §8.3: the frames this final was composed from must still be the current scene's (the compose hash itself also moves with the
      // asset ledger, which is not staleness).
      const current = await finalSource(deps, ctx.runId);
      if (!current || (music.meta as { framesHash?: string } | null)?.framesHash !== current.hash) return { status: 'failed', error: 'final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false };
      const musicTitle = (music.meta as { music?: string | null } | null)?.music ?? null;
      const stored = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'qc_report', inputHash: hash });
      const replay = stored ? QcReportSchema.safeParse(stored.content) : null;
      if (replay?.success) return decideQc(replay.data, musicTitle);
      const file = async (s: string) => join(deps.dataDir, (await getBlob(deps.pool, s))!.path);
      ctx.status('running', 'ölçülüyor: görüntü ve ses');
      const m = await probeQc(scene.ffmpeg, await file(music.blobSha), { edges: !layout, signal: ctx.signal });
      ctx.progress(60, 'deterministic');
      const t = await probeQc(scene.ffmpeg, await file(tiktok.blobSha), { video: false, signal: ctx.signal });
      ctx.status('running', null);
      const issues = layout ? layoutIssues(layout.content as LayoutManifest) : null;
      const report = buildQcReport(evaluateQc(m, { variant: 'music', layoutIssues: issues, coverOk: !!cover?.blobSha }), evaluateQc(t, { variant: 'tiktok' }));
      const dir = join(ctx.runDir, 'final', 'qc', hash.slice(0, 16));
      await mkdir(dir, { recursive: true });
      const qcFile = join(dir, 'qc.json');
      await writeFile(qcFile, JSON.stringify({ report, measure: { music: m, tiktok: t } }, null, 2));
      await record(deps, ctx, { kind: 'qc_report', file: qcFile, content: report, inputHash: hash, meta: { pass: report.pass } });
      return decideQc(report, musicTitle);
    },
  };
}

/** Review #1: the compose intermediates are in the blob store or no longer needed; layout.json and audio_plan.json stay (small). */
async function removeIntermediates(dir: string): Promise<void> {
  const keep = new Set(['layout.json', 'audio_plan.json']);
  for (const f of await readdir(dir)) if (!keep.has(f)) await rm(join(dir, f), { force: true });
}
