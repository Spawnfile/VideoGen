import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import {
  canonical, FINAL_CHECKS, FINAL_MAX_ROUNDS, fixReportRefErrors, fixScope, formatScore, sceneRefErrors, STOP_NOTE, storyboardRefErrors, validateArtifact,
  type FinalCheckId, type FixReport, type ModelAlias, type ProductResearch, type SceneSpec, type ScopeInput, type Storyboard,
} from '@videogen/shared';
import { appendAudit, findArtifact, getChannelStyle, insertVersion } from '@videogen/db';
import { SpecStore } from '@videogen/claude';
import { RESUME_PROMPT } from '../agents/manager.ts';
import { runStructured } from './agent-step.ts';
import { fenced } from './fence.ts';
import { buildScene } from './scene-tools.ts';
import { findingRows, type FixMeta } from './fix-round.ts';
import { openLabels, priorSession, type FixerRun, type FixFinding } from './review-step.ts';
import { failure, persist, record, type StepDeps } from './steps.ts';
import type { StepContext, StepOutcome } from './types.ts';
import { ARTIFACT_VALIDATOR } from './validator.ts';

/** Plan T8: the fixer's instruction. Only failed checks (with owner, severity, evidence and hint) are given; reviewer summaries and passing checks never are (spec §8.3). */
export function fixerPrompt(o: { name: string; round: number; reviewedRound: number; findings: FixFinding[] }): string {
  const rel = `review/final/r${o.reviewedRound}`;
  return [
    `Ürün: ${JSON.stringify(o.name)}. Final inceleme (tur ${o.reviewedRound}) videoyu düzeltmeye gönderdi; bu düzeltme turu ${o.round}/${FINAL_MAX_ROUNDS}.`,
    '',
    fenced('Başarısız kontroller', findingRows(o.findings)),
    '',
    `Kanıt kareleri: ${rel}/sheet.png (12 kare), ${rel}/hook.png (kanca sayfası) ve ${rel}/frames/ (tek kareler); Read ile bakabilirsin. Final 1080×1920, 30 fps; kare numarası/30 = saniye. qc bulgularında kanıt ölçülen değer ve sınırdır.`,
    'Yalnızca bu bulguları düzelt. Ekran yazısı, kanca ve etiket adları → write_spec(storyboard/scene) (yeniden birleştirme, dakikalar). Kamera, zamanlama, geometri, malzeme → write_spec(scene) ve/veya scene/product.py, sonra build_scene ve render_preview_stills ile kontrol (final yeniden render, ~35 dk). Araştırmayı değiştirme; desteksiz bir iddiayı ekrandan çıkar ya da yumuşat. cta ve loop_strategy hiçbir şey çizmez. Düzeltemediğini not_addressed\'e gerekçesiyle yaz.',
    `Çıktı: FixReport şeması. round ${o.round}; her başarısız kontrol kimliği addressed (check_id, change_summary_tr, files) ya da not_addressed (check_id, reason) içinde tam bir kez; rerender_scope: yazı/etiket/storyboard değişimi için "compose", sahne ya da product.py için "build", storyboard'un baştan yazılması gerekiyorsa "storyboard"; spec_diffs kısa Türkçe özet.`,
  ].join('\n');
}

const sha256 = async (path: string): Promise<string | null> => readFile(path).then((b) => createHash('sha256').update(b).digest('hex'), () => null);

/** F19: opus when any failed check is a visual or narrative one, sonnet for factual (D4, G2) and technical (qc) failures. */
export function fixerModel(failed: string[]): ModelAlias {
  const category = (id: string) => (id in FINAL_CHECKS ? FINAL_CHECKS[id as FinalCheckId].category : 'technical');
  return failed.some((id) => category(id) === 'visual' || category(id) === 'narrative') ? 'opus' : 'sonnet';
}

interface Prev { storyboard: Storyboard; scene: SceneSpec; research: ProductResearch; productSha: string | null }

/** Per kind, the newest artifact that does not belong to the pending version: what the round started from (not the SpecStore: a crashed fixer may have written there). */
async function loadPrev(pool: pg.Pool, runId: string, pendingId: string): Promise<Prev | null> {
  const row = async (kind: string) => (await pool.query(
    'SELECT content, blob_sha FROM artifacts WHERE run_id = $1 AND kind = $2 AND version_id IS DISTINCT FROM $3 ORDER BY created_at DESC LIMIT 1', [runId, kind, pendingId],
  )).rows[0] as { content: unknown; blob_sha: string | null } | undefined;
  const [sb, sc, rs, py] = await Promise.all(['storyboard', 'scene', 'research', 'product_py'].map(row));
  const storyboard = sb ? validateArtifact('Storyboard', sb.content) : null;
  const scene = sc ? validateArtifact('SceneSpec', sc.content) : null;
  const research = rs ? validateArtifact('ProductResearch', rs.content) : null;
  if (!storyboard?.ok || !scene?.ok || !research?.ok) return null;
  return { storyboard: storyboard.value, scene: scene.value, research: research.value, productSha: py?.blob_sha ?? null };
}

/** The SpecStore's latest state, validated, as the scope function wants it (a research spec absent from the store counts as unchanged). */
async function readNext(ctx: StepContext, prev: Prev): Promise<{ next: ScopeInput } | { errors: string[] }> {
  const specs = new SpecStore(join(ctx.runDir, 'spec'), ARTIFACT_VALIDATOR);
  const [sb, sc, rs] = await Promise.all((['storyboard', 'scene', 'research'] as const).map((k) => specs.read(k)));
  const storyboard = validateArtifact('Storyboard', sb?.value);
  const scene = validateArtifact('SceneSpec', sc?.value);
  const research = rs ? validateArtifact('ProductResearch', rs.value) : null;
  const errors = [
    ...(storyboard.ok ? [] : storyboard.errors.map((e) => `storyboard: ${e}`)), ...(scene.ok ? [] : scene.errors.map((e) => `scene: ${e}`)),
    ...(research && !research.ok ? research.errors.map((e) => `research: ${e}`) : []),
  ];
  if (errors.length || !storyboard.ok || !scene.ok) return { errors };
  const productSha = (await sha256(join(ctx.runDir, 'scene', 'product.py'))) ?? prev.productSha ?? '';
  return { next: { storyboard: storyboard.value, scene: scene.value, research: research?.ok ? research.value : prev.research, productSha, audio: null, audioMode: ctx.audioMode } };
}

/** The outcome of a recorded fix round (also the replay): compose/voice/build rewind, a claimed rewrite without change is a rework, nothing changed stops the loop. */
async function outcomeOf(deps: StepDeps, ctx: StepContext, input: Parameters<FixerRun>[2], m: FixMeta, replay: boolean): Promise<StepOutcome> {
  // 'voice' rewinds like the others; the voice step and the fixer's real voice handling are T8 (no VO run exists before it).
  const to = m.scope === 'build' ? 'build' : m.scope === 'compose' ? 'compose' : m.scope === 'voice' ? 'voice' : m.claimed === 'storyboard' ? 'storyboard' : null;
  if (to) {
    const reason = `fix:${to === 'storyboard' ? 'rework' : to}`;
    return { status: 'rewind', to, loop: 'final', reason: `düzeltme (${to}): ${openLabels(input.findings.map((f) => f.check_id))}`, version: { id: input.versionId, reason } };
  }
  const total = (await findArtifact(deps.pool, { runId: ctx.runId, kind: 'final_verdict', inputHash: input.hash }))?.content as { total?: number | null } | undefined;
  if (!replay) await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'loop.stop', runId: ctx.runId, stepId: ctx.stepId, data: { reason: 'unchanged', fixRound: ctx.fixRound, verdict: input.verdict, total: total?.total ?? null } });
  return { status: 'done', note: `${STOP_NOTE.unchanged}${typeof total?.total === 'number' ? `: ${formatScore(total.total)} puan` : ''}` };
}

/**
 * Spec §7.1 step 10 / plan T8: the fixer, inside the review step. The scope of its change is computed from the reviewed artifacts and the SpecStore
 * (its own claim only decides a rewrite without change); changed specs are persisted under the pending version first and the fix report last,
 * so the report is the commit marker a restarted step replays from.
 */
export const runFixer: FixerRun = async (deps, ctx, input) => {
  const { hash, round, versionId, findings } = input;
  const failed = findings.map((f) => f.check_id);
  const stored = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'fix_report', inputHash: hash });
  const storedMeta = stored?.meta as FixMeta | null;
  if (stored && storedMeta?.versionId === versionId && validateArtifact('FixReport', stored.content).ok) return outcomeOf(deps, ctx, input, storedMeta, true);

  // The review step inserted this row already; the repeat is a deliberate idempotent guard for a direct call (ON CONFLICT DO NOTHING).
  await insertVersion(deps.pool, { id: versionId, videoId: ctx.videoId, parentVersionId: ctx.versionId, round, reason: 'fix:pending' });
  const prev = await loadPrev(deps.pool, ctx.runId, versionId);
  if (!prev) return { status: 'failed', error: 'düzeltilecek storyboard, sahne ya da araştırma çıktısı yok', retry: false };
  const style = await getChannelStyle(deps.pool);
  const prevInput: ScopeInput = { storyboard: prev.storyboard, scene: prev.scene, research: prev.research, productSha: prev.productSha ?? '', audio: null, audioMode: ctx.audioMode };

  let computed: { next: ScopeInput; scope: 'none' | 'compose' | 'voice' | 'build'; changed: string[] } | null = null;
  // The fixer may not touch the research; a render change is built by the step itself (trusted), and its errors go back to the same session.
  const checkAsync = async (): Promise<{ errors: string[]; fatal?: string }> => {
    const n = await readNext(ctx, prev);
    if ('errors' in n) return { errors: n.errors };
    const refs = [...storyboardRefErrors(n.next.storyboard, prev.research), ...sceneRefErrors(n.next.scene, n.next.storyboard, style.id), ...(n.next.storyboard.audio_mode === ctx.audioMode ? [] : [`audio_mode ${ctx.audioMode} olmalı`])];
    if (refs.length) return { errors: refs };
    const s = fixScope({ prev: prevInput, next: n.next });
    if (s.changed.includes('research')) return { errors: ['research değiştirilemez: araştırmayı eski haline getir; desteksiz bir iddiayı storyboard\'dan çıkar ya da yumuşat.'] };
    if (s.scope === 'build') {
      if (!deps.scene) return { errors: [], fatal: 'render yapılandırılmadı' };
      const b = await buildScene(deps.scene, { runDir: ctx.runDir, owner: ctx.stepId, signal: ctx.signal });
      if (b.unavailable) return { errors: [], fatal: b.errors.join('; ') };
      if (!b.ok) return { errors: b.errors.map((e) => `build_scene: ${e}`) };
    }
    computed = { next: n.next, ...s };
    return { errors: [] };
  };

  // F24-style resume, bounded to this round's pending version row: a fixer session of an earlier round is never continued.
  const prior = await priorSession(deps.pool, { ...ctx, fixRound: round }, 'fixer');
  const r = await runStructured<FixReport>({
    manager: deps.manager, ctx, role: 'fixer', schema: 'FixReport', model: fixerModel(failed),
    prompt: fixerPrompt({ name: ctx.productName, round, reviewedRound: ctx.fixRound, findings }),
    initialResume: prior ? { claudeSessionId: prior.claudeSessionId, parent: prior.id, prompt: RESUME_PROMPT } : undefined,
    check: (v) => fixReportRefErrors(v, { round, failed, audioMode: ctx.audioMode }),
    checkAsync,
    fakeScript: deps.fakeScript ? (n) => deps.fakeScript!('fixer', ctx, n, { failed }) : undefined,
  });
  if (!r.ok) return failure(r);
  const done = computed as { next: ScopeInput; scope: 'none' | 'compose' | 'voice' | 'build'; changed: string[] } | null;
  if (!done) return { status: 'failed', error: 'düzeltme kapsamı hesaplanamadı', retry: false };

  const claimed = r.value.rerender_scope;
  if (claimed !== done.scope && !(claimed === 'storyboard' && done.scope === 'none')) {
    await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'fix.scope', runId: ctx.runId, stepId: ctx.stepId, data: { claimed, computed: done.scope, changed: done.changed, fixRound: ctx.fixRound } });
  }

  // Persist first (idempotent: an artifact of this version with the same content is not written again), the commit marker last.
  const fixCtx: StepContext = { ...ctx, versionId };
  const pendingOf = async (kind: string) => (await deps.pool.query('SELECT content FROM artifacts WHERE run_id = $1 AND kind = $2 AND version_id = $3 ORDER BY created_at DESC LIMIT 1', [ctx.runId, kind, versionId])).rows[0] as { content: unknown } | undefined;
  // Scope `none` writes no artifact on purpose: the SpecStore may then be ahead of the DB (a spec edit that changed nothing that renders, e.g. only `cta`).
  // Harmless: such a round ends the loop (unchanged) or is a storyboard rework, the next `prev` is read from the DB, and a later round persists whatever differs.
  if (done.scope !== 'none') {
    for (const [kind, before, after] of [['storyboard', prev.storyboard, done.next.storyboard], ['scene', prev.scene, done.next.scene]] as const) {
      // An artifact of this version already there (a crashed earlier attempt) is replaced when the head moved on, even back to the reviewed state.
      const have = await pendingOf(kind);
      if (have ? canonical(have.content) === canonical(after) : canonical(before) === canonical(after)) continue;
      await persist(deps, fixCtx, kind, after, hash, { latest: true });
    }
    if (done.changed.includes('product.py')) {
      const file = join(ctx.runDir, 'scene', 'product.py');
      const have = await deps.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'product_py' AND version_id = $2 AND blob_sha = $3", [ctx.runId, versionId, done.next.productSha]);
      if (!have.rowCount) await record(deps, fixCtx, { kind: 'product_py', file, inputHash: hash });
    }
  }
  const meta: FixMeta = { fixRound: ctx.fixRound, scope: done.scope, changed: done.changed, versionId, claimed };
  const dir = join(ctx.runDir, 'review', 'final', `r${ctx.fixRound}`);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'fix_report.json');
  await writeFile(file, JSON.stringify(r.value, null, 2));
  await record(deps, fixCtx, { kind: 'fix_report', file, content: r.value, inputHash: hash, meta });
  return outcomeOf(deps, ctx, input, meta, false);
};
