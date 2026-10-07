import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateArtifact } from '@videogen/shared';
import { appendAudit, findArtifact, getBlob, insertArtifact, latestArtifact } from '@videogen/db';
import { RenderError } from '../render/driver.ts';
import { missingFrames } from '../render/frames.ts';
import { sha, type StepDeps } from './steps.ts';
import type { StepExecutor } from './types.ts';

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
