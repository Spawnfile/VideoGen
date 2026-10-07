import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import {
  CHANNEL_STYLES, DRAFT_CHECK_IDS, DRAFT_CHECKS, DRAFT_GATES, DRAFT_MAX_RETURNS, DRAFT_RUBRIC_VERSION, draftDecision, formatClock, HOOK_PATTERN_LABELS,
  normalizeProductName, reviewRefErrors, sceneRefErrors, storyboardRefErrors, validateArtifact,
  type AudioMode, type BuildReport, type ChannelStyleId, type DraftCheckId, type ProductResearch, type Review, type SceneSpec, type StepKey, type Storyboard,
} from '@videogen/shared';
import { appendAudit, findArtifact, getBlob, getChannelStyle, insertArtifact, latestArtifact, latestStepSession, setProductDifficulty } from '@videogen/db';
import { SpecStore, type FakeScript, type SpecKind } from '@videogen/claude';
import { bundleHash, DRAFT_RENDER } from '@videogen/remotion/hash';
import { draftProps, type DraftProps } from '@videogen/remotion/props';
import { fenced } from './fence.ts';
import { ARTIFACT_VALIDATOR } from './validator.ts';
import { RESUME_PROMPT, type SessionManager, type UsageGate } from '../agents/manager.ts';
import { putBlob } from '../media.ts';
import { RenderError } from '../render/driver.ts';
import { contactSheet, draftProbeErrors, extractFrame, probeVideo } from '../render/ffmpeg.ts';
import type { ReviewTargets } from './review-tools.ts';
import type { FixerRun } from './review-step.ts';
import { runStructured } from './agent-step.ts';
import { composeExecutor, finalRenderExecutor, qcExecutor } from './final-steps.ts';
import { buildScene, previewScene, type SceneBuild, type SceneDeps } from './scene-tools.ts';
import type { StepContext, StepExecutor, StepOutcome } from './types.ts';

export { ARTIFACT_VALIDATOR } from './validator.ts';
/** Bump when a contract changes: old outputs stop matching and are not reused. */
const SCHEMA_VERSION = { research: 'ProductResearch@1', storyboard: 'Storyboard@1', scene: 'SceneSpec@1' } as const;
export type PipelineRole = 'researcher' | 'storyboarder' | 'builder' | 'reviewer_visual' | 'reviewer_facts' | 'reviewer_retention' | 'fixer';
/** Fake driver only: `styleId` for a fake build, `seq` (the second visual review is 2) and `failed` (the check ids a fixer is sent) for the final review loop. */
export interface FakeExtra { styleId?: ChannelStyleId; seq?: number; failed?: string[] }

export interface StepDeps {
  pool: pg.Pool;
  dataDir: string;
  manager: SessionManager;
  /** Fake driver only: scripted structured output per role and attempt (`styleId`: the channel style a fake build must use). */
  fakeScript?: (role: PipelineRole, ctx: StepContext, attempt: number, extra?: FakeExtra) => FakeScript | undefined;
  /** M4b: render driver, locks and pre-checks for the build step (absent: build fails with a reason). */
  scene?: SceneDeps;
  /** M4c: where the draft_review step registers the draft for extract_frames (plan C22; absent: the reviewer has the contact sheet only). */
  reviews?: ReviewTargets;
  /** M5b: the final review's fan-out waits for this gate (plan F8) and a new fix round needs it open (F15); absent: always open. */
  gate?: Pick<UsageGate, 'allowsNewPipeline' | 'resumeAt'>;
  /** M5b: the fixer the final review runs for a `fix` verdict (T8); null or absent: no fixer, the loop stops (`no_fixer`). */
  fixer?: FixerRun | null;
}

export const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export { fenced };

export function researchPrompt(name: string): string {
  return [
    `Ürün: "${name}"`,
    '',
    'Bu ürünün içini anlatan 35–55 saniyelik bir "içinde ne var" TikTok videosu için araştırma yap.',
    '- Ad belirsizse en yaygın yorumu seç ve `interpretation` alanına yaz.',
    '- Parçaları (kimlik: küçük harf, rakam, - veya _), işlevlerini, malzemelerini, yaklaşık ölçülerini (mm, [uzunluk, genişlik, yükseklik]), adetlerini ve montaj sırasını çıkar.',
    '- Her iddiayı kaynak URL\'si, kısa alıntı, erişim tarihi (YYYY-MM-DD) ve türüyle kaydet: primary (üretici, standart) ya da independent. Sayısal iddialar için 2 bağımsız ya da 1 birincil kaynak bul.',
    '- Ürün prosedürel olarak modellenemiyorsa ve lisanslı CC0 bir model de yoksa `difficulty: "too_hard"` ver ve `difficulty_reason_tr` ile gerekçesini yaz.',
    '- Kilometre taşlarında report_progress çağır.',
    'Sonucu yapılandırılmış çıktı (ProductResearch şeması) olarak döndür.',
  ].join('\n');
}

export function storyboardPrompt(name: string, mode: AudioMode, research: ProductResearch): string {
  return [
    `Ürün: "${name}". Ses modu: ${mode === 'vo' ? 'seslendirmeli (her vuruşta vo_text zorunlu)' : 'seslendirmesiz (vo_text yok; anlatımı ekran yazısı ve SFX taşır)'}.`,
    '',
    fenced('Araştırma (ProductResearch)', research),
    '',
    'Kurallar: süre 35–55 sn; vuruşlar 0 sn\'den duration_s\'ye boşluksuz ve bitişik; ilk vuruşta kahraman nesne ve kanca yazısı (en çok 60 karakter);',
    'kanca kalıbı şunlardan biri: question, number, misconception, reveal, contrast; ikinci kanca (rehook_at) sürenin %40–60\'ında, ödül (payoff_at) %70\'ten sonra;',
    `parça ve iddia kimlikleri yalnızca araştırmadakiler; kamera lensi 50–135 mm; audio_mode: "${mode}"; version: 1.`,
    'Sonucu yapılandırılmış çıktı (Storyboard şeması) olarak döndür.',
  ].join('\n');
}

async function persist(deps: StepDeps, ctx: StepContext, kind: SpecKind, value: unknown, inputHash: string): Promise<void> {
  const store = new SpecStore(join(ctx.runDir, 'spec'), ARTIFACT_VALIDATOR);
  const w = await store.write(kind, value);
  if ('errors' in w) throw new Error(`spec ${kind}: ${w.errors.join('; ')}`);
  const file = join(ctx.runDir, 'spec', kind, `v${String(w.version).padStart(4, '0')}.json`);
  const blob = await putBlob(deps.pool, deps.dataDir, file);
  const meta = await insertArtifact(deps.pool, { runId: ctx.runId, stepId: ctx.stepId, versionId: ctx.versionId, kind, blobSha: blob.sha256, content: value, inputHash, meta: { specVersion: w.version } });
  await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: ctx.runId, stepId: ctx.stepId, subjectType: 'artifact', subjectId: meta.id, data: { kind, sha256: blob.sha256, specVersion: w.version } });
}

export const failure = (r: { cancelled: boolean; error: string }): StepOutcome => (r.cancelled ? { status: 'cancelled' } : { status: 'failed', error: r.error, retry: false });

async function reusable(deps: StepDeps, ctx: StepContext, kind: 'research' | 'storyboard', hash: string): Promise<boolean> {
  const a = await findArtifact(deps.pool, { runId: ctx.runId, kind, inputHash: hash });
  return !!a && validateArtifact(kind === 'research' ? 'ProductResearch' : 'Storyboard', a.content).ok;
}

export function researchExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'research',
    resource: 'claude',
    inputHash: async (ctx) => sha({ step: 'research', product: normalizeProductName(ctx.productName), schema: SCHEMA_VERSION.research }),
    reuse: (ctx, hash) => reusable(deps, ctx, 'research', hash),
    async run(ctx, hash) {
      const r = await runStructured<ProductResearch>({
        manager: deps.manager, ctx, role: 'researcher', prompt: researchPrompt(ctx.productName), schema: 'ProductResearch',
        fakeScript: deps.fakeScript ? (n) => deps.fakeScript!('researcher', ctx, n) : undefined,
      });
      if (!r.ok) return failure(r);
      await persist(deps, ctx, 'research', r.value, hash);
      await setProductDifficulty(deps.pool, ctx.productId, r.value.difficulty);
      if (r.value.difficulty === 'too_hard') return { status: 'needs_human', reason: r.value.difficulty_reason_tr ?? 'Ürün prosedürel olarak modellenemiyor.' };
      // Plan B5: a CC0 asset would be needed; the asset ledger and its license gate arrive in M5 (spec §7.1: stop rather than look simple).
      if (r.value.difficulty === 'needs_asset') return { status: 'needs_human', reason: `Hazır 3D varlık gerekiyor; varlık defteri ve lisans kapısı M5'te.${r.value.difficulty_reason_tr ? ` ${r.value.difficulty_reason_tr}` : ''}` };
      return { status: 'done', note: r.value.interpretation };
    },
  };
}

export function storyboardExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'storyboard',
    resource: 'claude',
    async inputHash(ctx) {
      const research = await latestArtifact(deps.pool, ctx.runId, 'research');
      return sha({ step: 'storyboard', research: research?.id ?? null, audioMode: ctx.audioMode, schema: SCHEMA_VERSION.storyboard });
    },
    reuse: (ctx, hash) => reusable(deps, ctx, 'storyboard', hash),
    async run(ctx, hash) {
      const art = await latestArtifact(deps.pool, ctx.runId, 'research');
      const research = art ? validateArtifact('ProductResearch', art.content) : null;
      if (!research?.ok) return { status: 'failed', error: 'araştırma çıktısı yok', retry: false };
      const r = await runStructured<Storyboard>({
        manager: deps.manager, ctx, role: 'storyboarder', prompt: storyboardPrompt(ctx.productName, ctx.audioMode, research.value), schema: 'Storyboard',
        check: (s) => [...storyboardRefErrors(s, research.value), ...(s.audio_mode === ctx.audioMode ? [] : [`audio_mode ${ctx.audioMode} olmalı`])],
        fakeScript: deps.fakeScript ? (n) => deps.fakeScript!('storyboarder', ctx, n) : undefined,
      });
      if (!r.ok) return failure(r);
      await persist(deps, ctx, 'storyboard', r.value, hash);
      return { status: 'done', note: `${r.value.beats.length} vuruş · ${r.value.duration_s} sn · kanca: ${HOOK_PATTERN_LABELS[r.value.hook.pattern]}` };
    },
  };
}

/** Plan C8: what the draft review sent back — only the failed checks with their evidence and hints (spec §7.2), fenced as data. */
export function draftFixPrompt(r: Review, reviewedRound: number): string {
  const findings = r.checks.filter((c) => !c.pass).map((c) => ({
    id: c.id, onem: DRAFT_CHECKS[c.id].severity, kontrol: DRAFT_CHECKS[c.id].label_tr, kare: c.evidence?.frame ?? null, zaman_sn: c.evidence?.timecode ?? null, ipucu: c.fix_hint ?? null,
  }));
  return [
    `Taslak incelemesi (tur ${reviewedRound}) taslağı geri gönderdi. Yalnızca aşağıdaki bulguları düzelt: product.py ve/veya SceneSpec (kamera, patlatma zamanları) → write_spec(kind "scene") → build_scene → render_preview_stills ile kontrol et.`,
    '',
    fenced('Bulgular', { bulgular: findings, kapilar: DRAFT_GATES.filter((g) => !r.gate_results[g]) }),
    '',
    `Kanıt kareleri: review/r${reviewedRound}/sheet.png (12 kare) ve review/r${reviewedRound}/frames/ (Read ile bakabilirsin). Taslak 540×960 ve 30 fps; kare numarası/30 = saniye.`,
    'Sahnede (GLB ya da SceneSpec) bir şey değiştirmezsen taslak yeniden incelenmez ve video insan incelemesine düşer.',
    "Son başarılı build_scene'deki SceneSpec'i değiştirmeden yapılandırılmış çıktı (SceneSpec şeması) olarak döndür.",
  ].join('\n');
}

export function buildPrompt(name: string, styleId: ChannelStyleId, storyboard: Storyboard, research: ProductResearch): string {
  const style = CHANNEL_STYLES[styleId];
  const parts = research.parts.map((p) => ({ id: p.id, name_tr: p.name_tr, material: p.material, approx_dims_mm: p.approx_dims_mm, count: p.count, function: p.function }));
  return [
    `Ürün: "${name}". Kanal kimliği: style_id "${styleId}" (${style.name_tr}), ışık "${style.lighting}".`,
    '',
    fenced('Storyboard', storyboard),
    '',
    fenced('Araştırmadaki parçalar ve mekanizma', { parts, mechanism: research.mechanism }),
    '',
    'Görev: scene/product.py (vg API, yalnızca `import math`, `def build(vg)`) ve SceneSpec yaz. Döngü: write_spec(kind "scene") → build_scene → hataları ve uyarıları düzelt → render_preview_stills → kontakt sayfasını Read ile incele → gerekirse tekrarla.',
    `Kurallar: duration_s ${storyboard.duration_s}, frames ${Math.round(storyboard.duration_s * 30)}, style_id "${styleId}", lighting_preset "${style.lighting}"; storyboard'daki her parça SceneSpec'te ve product.py'de aynı kimlikle; hero_part ilk vuruşun parçalarından biri ve 0. karede kadraj yüksekliğinin en az %35'i;`,
    "mekanizma vuruşunda mekanizmanın çalıştığı yeri gösteren yakın çekim; vuruşun konusu olmayan parça kadrajın en çok %25'i; lens 50–135 mm; 1 birim = 1 cm; asset_ref kullanma.",
    'Son başarılı build_scene\'deki SceneSpec\'i değiştirmeden yapılandırılmış çıktı (SceneSpec şeması) olarak döndür.',
  ].join('\n');
}

const BUILD_FILE_KINDS = [['blend', 'scene_blend'], ['glb', 'scene_glb']] as const;
const BUILD_JSON_KINDS = [['anchors', 'scene_anchors'], ['events', 'scene_events'], ['cameraTrack', 'camera_track'], ['report', 'build_report']] as const;

/** Spec §7.1 step 4: builder agent → SceneSpec + product.py; the step's own trusted build and previews become the artifacts. */
export function buildExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'build',
    resource: 'claude',
    async inputHash(ctx) {
      const storyboard = await latestArtifact(deps.pool, ctx.runId, 'storyboard');
      const style = await getChannelStyle(deps.pool);
      // Plan C8: a fix round is a new input (the review it answers), so it never reuses the previous round's build.
      const review = ctx.round > 0 ? await latestArtifact(deps.pool, ctx.runId, 'draft_review') : null;
      return sha({ step: 'build', storyboard: storyboard?.id ?? null, style: style.id, schema: SCHEMA_VERSION.scene, round: ctx.round, review: review?.id ?? null });
    },
    async reuse(ctx, hash) {
      const scene = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'scene', inputHash: hash });
      const glb = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'scene_glb', inputHash: hash });
      return !!scene && !!glb && validateArtifact('SceneSpec', scene.content).ok;
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const cap = scene.capability();
      if (!cap.ok) return { status: 'failed', error: `render kullanılamıyor: ${cap.reason}`, retry: false };
      const sb = await latestArtifact(deps.pool, ctx.runId, 'storyboard');
      const rs = await latestArtifact(deps.pool, ctx.runId, 'research');
      const storyboard = sb ? validateArtifact('Storyboard', sb.content) : null;
      const research = rs ? validateArtifact('ProductResearch', rs.content) : null;
      if (!storyboard?.ok || !research?.ok) return { status: 'failed', error: 'storyboard ya da araştırma çıktısı yok', retry: false };
      const style = await getChannelStyle(deps.pool);
      const specs = new SpecStore(join(ctx.runDir, 'spec'), ARTIFACT_VALIDATOR);
      let last: SceneBuild | null = null;
      const reviewArt = ctx.round > 0 ? await latestArtifact(deps.pool, ctx.runId, 'draft_review') : null;
      const review = reviewArt ? validateArtifact('Review', reviewArt.content) : null;
      const fixes = review?.ok ? draftFixPrompt(review.value, ctx.round - 1) : null;
      // Plan B15 + C8: a restarted attempt, or a draft fix round, continues the step's own builder session (it knows product.py).
      const prior = ctx.attempt > 1 || fixes ? await latestStepSession(deps.pool, ctx.stepId) : null;
      const resumePrompt = fixes ? (ctx.attempt > 1 ? `${RESUME_PROMPT}\n\n${fixes}` : fixes) : RESUME_PROMPT;
      const fresh = buildPrompt(ctx.productName, style.id, storyboard.value, research.value) + (fixes ? `\n\n${fixes}` : '');
      const r = await runStructured<SceneSpec>({
        manager: deps.manager, ctx, role: 'builder', prompt: fresh, schema: 'SceneSpec',
        initialResume: prior?.role === 'builder' ? { claudeSessionId: prior.claudeSessionId, parent: prior.id, prompt: resumePrompt } : undefined,
        check: (s) => sceneRefErrors(s, storyboard.value, style.id),
        // Plan B6: the structured SceneSpec is canonical; the step builds it itself with the final scene/product.py.
        checkAsync: async (s) => {
          const latest = await specs.read('scene');
          if (!latest || JSON.stringify(latest.value) !== JSON.stringify(s)) {
            const w = await specs.write('scene', s);
            if ('errors' in w) return { errors: w.errors };
          }
          last = await buildScene(scene, { runDir: ctx.runDir, owner: ctx.stepId, signal: ctx.signal });
          if (last.unavailable) return { errors: [], fatal: last.errors.join('; ') };
          return { errors: last.errors.map((e) => `build_scene: ${e}`) };
        },
        fakeScript: deps.fakeScript ? (n) => deps.fakeScript!('builder', ctx, n, { styleId: style.id }) : undefined,
      });
      if (!r.ok) return failure(r);
      const built = last as SceneBuild | null;
      if (!built?.ok || !built.files) return { status: 'failed', error: 'güvenilir build sonucu yok', retry: false };
      const preview = await previewScene(scene, {
        runDir: ctx.runDir, owner: ctx.stepId, signal: ctx.signal,
        onWait: (w) => ctx.status('waiting_gpu', w.reason ?? `GPU sırası: ${w.position}`), onRun: () => ctx.status('running', null),
      });
      await persist(deps, ctx, 'scene', r.value, hash);
      const put = async (kind: string, file: string, content?: unknown, meta?: unknown) => {
        const blob = await putBlob(deps.pool, deps.dataDir, file);
        const a = await insertArtifact(deps.pool, { runId: ctx.runId, stepId: ctx.stepId, versionId: ctx.versionId, kind, blobSha: blob.sha256, content, inputHash: hash, meta });
        await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: ctx.runId, stepId: ctx.stepId, subjectType: 'artifact', subjectId: a.id, data: { kind, sha256: blob.sha256 } });
      };
      await put('product_py', join(ctx.runDir, 'scene', 'product.py'));
      for (const [k, kind] of BUILD_FILE_KINDS) await put(kind, built.files[k]);
      for (const [k, kind] of BUILD_JSON_KINDS) await put(kind, built.files[k], JSON.parse(await readFile(built.files[k], 'utf8')));
      await put('preview_sheet', preview.sheet, undefined, { frames: preview.stills.length, renderer: preview.renderer });
      const rep = built.report!;
      return { status: 'done', note: `${rep.parts.length} parça · ${rep.triangles.toLocaleString('tr-TR')} üçgen · ${rep.warnings.length ? `${rep.warnings.length} uyarı` : 'uyarı yok'}${style.chosen ? '' : ' · kanal kimliği geçici'}` };
    },
  };
}

/** Artifact file → media store → `artifacts` row → audit (the draft steps; the build keeps its own `put`). */
export async function record(deps: StepDeps, ctx: StepContext, a: { kind: string; file: string; inputHash: string; content?: unknown; meta?: unknown; media?: { durationMs: number; width: number; height: number; codec: string } }): Promise<string> {
  const blob = await putBlob(deps.pool, deps.dataDir, a.file);
  const m = await insertArtifact(deps.pool, { runId: ctx.runId, stepId: ctx.stepId, versionId: ctx.versionId, kind: a.kind, blobSha: blob.sha256, content: a.content, inputHash: a.inputHash, meta: a.meta, ...a.media });
  await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: ctx.runId, stepId: ctx.stepId, subjectType: 'artifact', subjectId: m.id, data: { kind: a.kind, sha256: blob.sha256 } });
  return m.id;
}

/** `draft_video` meta (grilling missing decision 3): what the unchanged-fix rule, same-round reuse and the review rely on. */
export interface DraftMeta { round: number; glbSha: string; specHash: string; frames: number; renderMs: number; concurrency: number }

export interface DraftSource { hash: string; glbSha: string; glbPath: string; specHash: string; props: Omit<DraftProps, 'glbUrl'> }

/**
 * Spec §8.3 / plan C19: the draft's inputs (latest GLB, scene spec, storyboard and camera track of the run) and its input hash
 * = GLB sha + scene spec hash + composition props (style, texts, lens track) + bundle hash + fixed render parameters.
 */
export async function draftSource(deps: Pick<StepDeps, 'pool' | 'dataDir'>, runId: string): Promise<DraftSource | null> {
  const [scene, glb, track, board] = await Promise.all(['scene', 'scene_glb', 'camera_track', 'storyboard'].map((k) => latestArtifact(deps.pool, runId, k)));
  const s = scene ? validateArtifact('SceneSpec', scene.content) : null;
  const b = board ? validateArtifact('Storyboard', board.content) : null;
  const yfov = (track?.content as { yfov?: number[] } | null)?.yfov;
  const blob = glb?.blobSha ? await getBlob(deps.pool, glb.blobSha) : null;
  if (!s?.ok || !b?.ok || !yfov || !blob) return null;
  const { glbUrl: _url, ...props } = draftProps({ glbUrl: '', yfov, width: DRAFT_RENDER.width, height: DRAFT_RENDER.height, scene: s.value, storyboard: b.value, style: CHANNEL_STYLES[s.value.style_id] });
  const specHash = sha(s.value);
  return { glbSha: blob.sha256, glbPath: join(deps.dataDir, blob.path), specHash, props, hash: sha({ step: 'draft_render', glb: blob.sha256, spec: specHash, props: sha(props), bundle: bundleHash(), render: DRAFT_RENDER }) };
}

/** Failed checks of the last draft review, as Turkish labels ("Mekanizma çekimi, G3"). */
async function openFindings(deps: StepDeps, runId: string): Promise<string> {
  const a = await latestArtifact(deps.pool, runId, 'draft_review');
  const v = a ? validateArtifact('Review', a.content) : null;
  if (!v?.ok) return '';
  return [...v.value.checks.filter((c) => !c.pass).map((c) => DRAFT_CHECKS[c.id].label_tr), ...DRAFT_GATES.filter((g) => !v.value.gate_results[g])].join(', ');
}

/** Spec §7.1 step 5: GLB + SceneSpec → Three.js-in-Remotion draft MP4 + cover. GPU: the orchestrator holds the lock (plan C21). */
export function draftRenderExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'draft_render',
    resource: 'gpu',
    extraDiskMb: 300,
    async inputHash(ctx) {
      return (await draftSource(deps, ctx.runId))?.hash ?? sha({ step: 'draft_render', missing: true });
    },
    // Grilling C19: only a draft of this round counts; the same draft from an earlier round is the unchanged-fix signal in run().
    async reuse(ctx, hash) {
      const a = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'draft_video', inputHash: hash });
      const blob = a?.blobSha ? await getBlob(deps.pool, a.blobSha) : null;
      return !!a && (a.meta as DraftMeta | null)?.round === ctx.round && !!blob && existsSync(join(deps.dataDir, blob.path));
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const src = await draftSource(deps, ctx.runId);
      if (!src) return { status: 'failed', error: "sahne çıktısı yok (GLB, sahne spec'i, storyboard ya da kamera izi)", retry: false };
      if (ctx.round > 0) {
        // Inherited rule: a fix round whose GLB and scene spec equal the previous round's is not rendered or reviewed again.
        const prev = (await latestArtifact(deps.pool, ctx.runId, 'draft_video'))?.meta as DraftMeta | undefined;
        if (prev && prev.round < ctx.round && prev.glbSha === src.glbSha && prev.specHash === src.specHash) {
          const open = await openFindings(deps, ctx.runId);
          return { status: 'needs_human', reason: `Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi.${open ? ` Açık bulgular: ${open}.` : ''}` };
        }
      }
      const dir = join(ctx.runDir, 'draft', `r${ctx.round}`);
      const out = join(dir, 'draft.mp4');
      try {
        ctx.status('running', 'taslak hazırlanıyor (bundle, Chrome)');
        const r = await scene.render.draft({
          runDir: ctx.runDir, props: src.props, glbPath: src.glbPath, outPath: out, owner: ctx.stepId, signal: ctx.signal,
          onStage: (s) => { if (s === 'frames') ctx.status('running', null); },
          onProgress: (done, total) => ctx.progress(Math.min(99, (done / total) * 100), 'render'),
        });
        const probe = await probeVideo(scene.ffmpeg, out, ctx.signal);
        const errors = draftProbeErrors(probe, { width: src.props.width, height: src.props.height, frames: r.frames });
        if (errors.length) {
          await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'render.draft_rejected', runId: ctx.runId, stepId: ctx.stepId, data: { errors } });
          return { status: 'failed', error: `taslak MP4 doğrulamadan geçmedi: ${errors.join('; ')}`, retry: false };
        }
        const cover = join(dir, 'cover.png');
        await extractFrame(scene.ffmpeg, out, cover, { t: 0, width: 270, signal: ctx.signal });
        const meta: DraftMeta = { round: ctx.round, glbSha: src.glbSha, specHash: src.specHash, frames: probe.frames, renderMs: r.ms, concurrency: r.concurrency };
        await record(deps, ctx, { kind: 'draft_video', file: out, inputHash: hash, meta, media: { durationMs: Math.round(probe.durationS * 1000), width: probe.width, height: probe.height, codec: probe.codec } });
        await record(deps, ctx, { kind: 'draft_cover', file: cover, inputHash: hash, meta: { round: ctx.round } });
        return { status: 'done', note: `${probe.width}×${probe.height} · ${formatClock(probe.durationS)} · render ${Math.round(r.ms / 1000)} sn` };
      } catch (e) {
        if (e instanceof RenderError && e.kind !== 'aborted') return { status: 'failed', error: e.message, retry: false };
        throw e;
      }
    },
  };
}

/** Twelve contact-sheet times spread over the draft (centres of twelfths), in seconds. */
export const sheetTimes = (durationS: number): number[] => Array.from({ length: 12 }, (_, i) => Math.round((((i + 0.5) * durationS) / 12) * 1000) / 1000);

export function reviewPrompt(o: { name: string; storyboard: Storyboard; scene: SceneSpec; warnings: string[]; durationS: number; frames: number; times: number[]; sheet: string }): string {
  const bounds = [...new Set(o.storyboard.beats.flatMap((b) => [b.t_start, b.t_end]))];
  return [
    `Ürün: "${o.name}". Görev: "içinde ne var" videosunun taslağını görsel olarak incele ve sonucu Review şemasında döndür. Builder'ın gerekçesini görmüyorsun; yalnızca karelere ve aşağıdaki verilere bak.`,
    `Taslak: 540×960 (%50 ölçek; boyut eşiklerini orana göre yargıla), 30 fps, ${o.frames} kare, ${formatClock(o.durationS)}.`,
    '',
    fenced('Storyboard', { hook: o.storyboard.hook, beats: o.storyboard.beats.map((b) => ({ id: b.id, t_start: b.t_start, t_end: b.t_end, parts: b.parts, action: b.action, onscreen_text: b.onscreen_text.tr })) }),
    '',
    fenced('Sahne', { hero_part: o.scene.hero_part, parts: o.scene.parts.map((p) => ({ id: p.id, name_tr: p.name_tr })), build_warnings: o.warnings }),
    '',
    `Kontakt sayfası: ${o.sheet} (12 kare; soldan sağa, yukarıdan aşağı; zamanlar sn: ${o.times.join(', ')}). Read ile aç. Kırmızı bölgeler TikTok arayüzünün kapattığı alan.`,
    `Vuruş sınırları (sn): ${bounds.join(', ')}. Gerekirse extract_frames ile en çok 12 tek kare al (kırpma 2× büyütür).`,
    '',
    'Kontroller (her biri tam bir kez, bu kimliklerle; önemi kimlik belirler, sen belirlemezsin):',
    ...DRAFT_CHECK_IDS.map((id) => `- ${id} (${DRAFT_CHECKS[id].severity}): ${DRAFT_CHECKS[id].ask_tr}`),
    '',
    `Kurallar: pass:false ise evidence.frame (0–${o.frames - 1}), evidence.timecode (sn; kare/30 ile ±0,5 içinde) ve fix_hint (builder için somut, Türkçe) zorunlu. score 0–1. dimension_scores: D2 0–15, D3 0–12, D5 0–10, D9 0–8. gate_results: G3 (üçüncü taraf logo/filigran yok), G5 (CG gerçek çekim gibi sunulmuyor; taklit edilebilir tehlikeli eylem yok). rubric_version "${DRAFT_RUBRIC_VERSION}", reviewer_role "reviewer_visual", summary_tr kısa Türkçe özet.`,
  ].join('\n');
}

/** Inherited D6: the decision is draftDecision's; this only words it and applies the round limit (inherited D5). */
export function decideDraft(review: Review, round: number): StepOutcome {
  const d = draftDecision(review);
  const label = (id: DraftCheckId) => DRAFT_CHECKS[id].label_tr;
  const minor = d.minor.length ? ` · küçük bulgu: ${d.minor.map(label).join(', ')}` : '';
  if (d.verdict === 'pass') return { status: 'done', note: `geçti${minor}` };
  const open = [...d.blocking.map(label), ...d.gates].join(', ');
  if (round >= DRAFT_MAX_RETURNS) return { status: 'needs_human', reason: `${DRAFT_MAX_RETURNS} taslak turundan sonra açık bulgu: ${open}.` };
  return { status: 'rewind', to: 'build', reason: `düzeltilecek: ${open}` };
}

/** One reviewer_visual pass over the draft: 12-frame contact sheet, ≤ 12 single frames (extract_frames), the stored Review. */
async function reviewDraft(deps: StepDeps, ctx: StepContext, hash: string, d: { video: string; meta: DraftMeta; draftId: string }): Promise<{ review: Review } | { outcome: StepOutcome }> {
  const scene = deps.scene!;
  const dir = join(ctx.runDir, 'review', `r${ctx.round}`);
  const sheetDir = join(dir, 'sheet');
  await mkdir(sheetDir, { recursive: true });
  const probe = await probeVideo(scene.ffmpeg, d.video, ctx.signal);
  const times = sheetTimes(probe.durationS);
  for (const [i, at] of times.entries()) await extractFrame(scene.ffmpeg, d.video, join(sheetDir, `f${String(i).padStart(5, '0')}.png`), { t: at, signal: ctx.signal });
  const sheet = join(dir, 'sheet.png');
  await contactSheet(scene.ffmpeg, sheetDir, sheet, { cols: 4, rows: 3, signal: ctx.signal });
  await record(deps, ctx, { kind: 'review_sheet', file: sheet, inputHash: hash, meta: { round: ctx.round, times } });
  const [sb, sc, rep] = await Promise.all(['storyboard', 'scene', 'build_report'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
  const storyboard = sb ? validateArtifact('Storyboard', sb.content) : null;
  const sceneSpec = sc ? validateArtifact('SceneSpec', sc.content) : null;
  if (!storyboard?.ok || !sceneSpec?.ok) return { outcome: { status: 'failed', error: "storyboard ya da sahne spec'i yok", retry: false } };
  deps.reviews?.set(ctx.stepId, { round: ctx.round, video: d.video, frames: d.meta.frames, fps: 30, durationS: probe.durationS, outDir: join(dir, 'frames') });
  try {
    // Grilling missing decision 2: a restarted review continues its own reviewer session.
    const prior = ctx.attempt > 1 ? await latestStepSession(deps.pool, ctx.stepId) : null;
    const r = await runStructured<Review>({
      manager: deps.manager, ctx, role: 'reviewer_visual', schema: 'Review',
      prompt: reviewPrompt({ name: ctx.productName, storyboard: storyboard.value, scene: sceneSpec.value, warnings: (rep?.content as BuildReport | null)?.warnings ?? [], durationS: probe.durationS, frames: d.meta.frames, times, sheet: `review/r${ctx.round}/sheet.png` }),
      initialResume: prior?.role === 'reviewer_visual' ? { claudeSessionId: prior.claudeSessionId, parent: prior.id, prompt: RESUME_PROMPT } : undefined,
      check: (v) => reviewRefErrors(v, { frames: d.meta.frames, fps: 30 }),
      fakeScript: deps.fakeScript ? (n) => deps.fakeScript!('reviewer_visual', ctx, n) : undefined,
    });
    if (!r.ok) return { outcome: failure(r) };
    const file = join(dir, 'review.json');
    await writeFile(file, JSON.stringify(r.value, null, 2));
    await record(deps, ctx, { kind: 'draft_review', file, content: r.value, inputHash: hash, meta: { round: ctx.round, verdict: draftDecision(r.value).verdict, draftArtifactId: d.draftId } });
    return { review: r.value };
  } finally {
    deps.reviews?.delete(ctx.stepId);
  }
}

/** Spec §7.1 step 6: reviewer_visual reviews the draft; pass → done, revise → back to build (≤ 2 returns), then needs_human. */
export function draftReviewExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'draft_review',
    resource: 'claude',
    async inputHash(ctx) {
      const d = await latestArtifact(deps.pool, ctx.runId, 'draft_video');
      return sha({ step: 'draft_review', draft: d?.id ?? null, draftHash: d?.inputHash ?? null, rubric: DRAFT_RUBRIC_VERSION, round: ctx.round });
    },
    // No `reuse`: a stored review is replayed in run(), so a "revise" is never turned into "done" (grilling C7).
    async run(ctx, hash) {
      if (!deps.scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const draft = await latestArtifact(deps.pool, ctx.runId, 'draft_video');
      const meta = draft?.meta as DraftMeta | null | undefined;
      const blob = draft?.blobSha ? await getBlob(deps.pool, draft.blobSha) : null;
      if (!draft || !meta || !blob) return { status: 'failed', error: 'incelenecek taslak yok', retry: false };
      // Spec §8.3: a draft whose hash does not match the current GLB, scene spec, style and template is never reviewed.
      if ((await draftSource(deps, ctx.runId))?.hash !== draft.inputHash) return { status: 'failed', error: 'taslak güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false };
      const stored = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'draft_review', inputHash: hash });
      const replay = stored ? validateArtifact('Review', stored.content) : null;
      if (replay?.ok) return decideDraft(replay.value, ctx.round);
      const r = await reviewDraft(deps, ctx, hash, { video: join(deps.dataDir, blob.path), meta, draftId: draft.id });
      return 'outcome' in r ? r.outcome : decideDraft(r.review, ctx.round);
    },
  };
}

export function pipelineExecutors(deps: StepDeps): Partial<Record<StepKey, StepExecutor>> {
  return {
    research: researchExecutor(deps), storyboard: storyboardExecutor(deps), build: buildExecutor(deps),
    draft_render: draftRenderExecutor(deps), draft_review: draftReviewExecutor(deps),
    final_render: finalRenderExecutor(deps), compose: composeExecutor(deps), qc: qcExecutor(deps),
  };
}
