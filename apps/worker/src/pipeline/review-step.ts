import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  averageVisual, checksOf, FINAL_CHECK_IDS, FINAL_CHECKS, FINAL_REVIEWER_ROLES, finalReviewRefErrors, finalVerdict, formatScore, GATE_IDS, isBorderline, loopAction,
  checkHistory, panelScore, QC_CHECKS, QcReportSchema, RUBRIC_VERSION, SceneEventsSchema, scoreReview, STOP_NOTE, validateArtifact,
  type FinalCheckId, type FinalReview, type FinalReviewerRole, type LoopStop, type PanelScore, type ProductResearch, type QcReport, type RoundChecks, type SceneSpec, type Storyboard,
} from '@videogen/shared';
import {
  appendAudit, findArtifact, getBlob, insertVersion, latestArtifact, latestStepSession, listRunReviews, recordReviewRound,
  type NewFinding, type NewReview, type ReviewRecord,
} from '@videogen/db';
import type pg from 'pg';
import type { LayoutManifest } from '@videogen/remotion/layout';
import { RESUME_PROMPT } from '../agents/manager.ts';
import { contactSheet, extractFrame, probeVideo } from '../render/ffmpeg.ts';
import { runStructured } from './agent-step.ts';
import { currentEvents, finalSource, type FinalFramesMeta } from './final-steps.ts';
import { LIMIT_NOTE } from './notes.ts';
import { manifestFacts, numericGaps, qcFacts, recentHooks, retentionTimes, webCheckTargets, type WebTarget } from './review-inputs.ts';
import { factsPrompt, retentionPrompt, visualPrompt } from './review-prompts.ts';
import { labelOf } from './fix-round.ts';
import { failure, record, sha, sheetTimes, type StepDeps } from './steps.ts';
import type { StepContext, StepExecutor, StepOutcome } from './types.ts';

type Verdict = 'ready' | 'fix' | 'rework';
const FPS = 30;
const ROLE_KIND: Record<FinalReviewerRole, string> = { reviewer_visual: 'final_review_visual', reviewer_facts: 'final_review_facts', reviewer_retention: 'final_review_retention' };
const SECOND_KIND = 'final_review_visual2';
const ROLE_LABEL: Record<FinalReviewerRole, string> = { reviewer_visual: 'görsel reviewer', reviewer_facts: 'doğruluk reviewer', reviewer_retention: 'izlenme reviewer' };

/** What `final_verdict` stores (plan T7 step 6) and a restarted review decides from again. */
export interface StoredVerdict {
  verdict: Verdict;
  total: number | null;
  dimensions: PanelScore['dimensions'];
  gates: PanelScore['gates'];
  low: string[];
  failed: string[];
  regressed: string[];
  fixed: string[];
  oscillating: string[];
}

/** One failed check handed to the fixer: what, how bad, where, and the reviewer's hint. */
export interface FixFinding { check_id: string; severity: string; evidence: unknown; fix_hint: string | null }
export interface FixerInput {
  /** The review step's input hash of the reviewed round. */
  hash: string;
  /** The new round (`ctx.fixRound + 1`; the review step's own context still carries the reviewed round). */
  round: number;
  /** The pending `versions` row of the new round: the fixer writes its spec artifacts under it. */
  versionId: string;
  verdict: Verdict;
  findings: FixFinding[];
}
/** The fixer (T8) runs inside the review step and returns the step's outcome (normally a final `rewind`). */
export type FixerRun = (deps: StepDeps, ctx: StepContext, input: FixerInput) => Promise<StepOutcome>;

/**
 * Plan F13: the version row of a fix round has a deterministic id, a v4-shaped hash of (run, 'fix', NEW round), so a restart reuses the row.
 * `round` is the round the row starts (the reviewed round + 1), the same number `versions.round` and `steps.fix_round` get at the rewind.
 */
export function fixVersionId(runId: string, round: number): string {
  const h = sha({ runId, kind: 'fix', round });
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * The session of `role` a restarted step may resume (plan B15/F24): the newest one of this step, but in a fix round only one created since the
 * round's version row (`fixVersionId`) existed, so a session of an earlier round is never continued. No version row in a fix round: none.
 * The T8 fixer resumes through the same bound.
 */
export async function priorSession(pool: pg.Pool, ctx: StepContext, role: string) {
  if (ctx.fixRound === 0) return latestStepSession(pool, ctx.stepId, role);
  const v = await pool.query('SELECT created_at FROM versions WHERE id = $1', [fixVersionId(ctx.runId, ctx.fixRound)]);
  return v.rows[0] ? latestStepSession(pool, ctx.stepId, role, new Date(v.rows[0].created_at)) : null;
}

const isStoredVerdict = (v: unknown): v is StoredVerdict => {
  const o = v as Partial<StoredVerdict> | null;
  return !!o && ['ready', 'fix', 'rework'].includes(o.verdict as string) && Array.isArray(o.oscillating) && Array.isArray(o.failed) && typeof o.dimensions === 'object';
};

/** Ids of the qc checks the loop tracks and scores (a gate or points). */
const QC_JUDGED = (Object.keys(QC_CHECKS) as (keyof typeof QC_CHECKS)[]).filter((id) => QC_CHECKS[id].gate || QC_CHECKS[id].points > 0);

/**
 * The finished rounds of a run as the loop reads them (plan T7 step 5, T9 finalize): per round the orchestrator row gives total and verdict; a check
 * failed when any first-pass row of the round has a finding for it; it passed when its reviewer ran (a role row exists) or it is a qc check, and it did not fail.
 */
export function roundChecks(rows: ReviewRecord[]): (RoundChecks & { regressed: boolean })[] {
  const rounds = [...new Set(rows.map((r) => r.round))].sort((a, b) => a - b);
  return rounds.flatMap((round) => {
    const mine = rows.filter((r) => r.round === round && r.seq === 1);
    const orch = mine.find((r) => r.reviewerRole === 'orchestrator');
    if (!orch) return [];
    const failed = [...new Set(mine.flatMap((r) => r.findings.map((f) => f.checkId)))];
    const reviewed = FINAL_REVIEWER_ROLES.filter((role) => mine.some((r) => r.reviewerRole === role)).flatMap((role) => checksOf(role) as string[]);
    return [{
      round, versionId: orch.versionId, total: orch.total, verdict: (orch.verdict ?? 'fix') as Verdict,
      failed, passed: [...reviewed, ...QC_JUDGED].filter((id) => !failed.includes(id)),
      regressed: mine.some((r) => r.findings.some((f) => f.status === 'regressed')),
    }];
  });
}

/** F10 meets F4: G2 fails deterministically while a numeric claim has no rule-satisfying source, whatever the reviewer said. */
function withGapGate(s: PanelScore, gaps: string[]): PanelScore {
  if (!gaps.length) return s;
  const llm = [...new Set([...s.failed.filter((id) => id in FINAL_CHECKS), 'claims_verified'])].sort((a, b) => FINAL_CHECK_IDS.indexOf(a as FinalCheckId) - FINAL_CHECK_IDS.indexOf(b as FinalCheckId));
  return {
    ...s, gates: { ...s.gates, G2: false }, failedGates: GATE_IDS.filter((g) => g === 'G2' || s.failedGates.includes(g)),
    failed: [...llm, ...s.failed.filter((id) => !(id in FINAL_CHECKS))],
  };
}

export const openLabels = (failed: string[]) => `${failed.slice(0, 5).map(labelOf).join(', ')}${failed.length > 5 ? ` (+${failed.length - 5})` : ''}`;

/** The fan-out gate (plan F8): wait, with the signal and a poll, until a new pipeline session may start. false: the run was cancelled meanwhile. */
async function awaitGate(deps: StepDeps, ctx: StepContext, pollMs: number): Promise<boolean> {
  const gate = deps.gate;
  if (!gate || gate.allowsNewPipeline()) return true;
  ctx.status('waiting_limit', LIMIT_NOTE(gate.resumeAt()));
  while (!gate.allowsNewPipeline()) {
    if (ctx.signal.aborted) return false;
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); ctx.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, pollMs);
      ctx.signal.addEventListener('abort', done, { once: true });
    });
  }
  if (ctx.signal.aborted) return false;
  ctx.status('running', null);
  return true;
}

/**
 * One context per parallel reviewer (plan F8): the step's progress is the mean of the three × 0.8 (the rest is the total and the fixer),
 * the step waits for the limit when any of them does, and each has its own abort signal (linked to the run's) so a failing role stops its siblings.
 */
function panelContexts(ctx: StepContext, active: FinalReviewerRole[], o: { session: (id: string) => void; second?: boolean }) {
  const pct = new Map<FinalReviewerRole, number>(FINAL_REVIEWER_ROLES.map((r) => [r, active.includes(r) ? 0 : 100]));
  const waiting = new Set<FinalReviewerRole>();
  const controllers = new Map<FinalReviewerRole, AbortController>();
  const unlink: (() => void)[] = [];
  const contexts = new Map<FinalReviewerRole, StepContext>();
  for (const role of active) {
    const ac = new AbortController();
    const onAbort = () => ac.abort(ctx.signal.reason);
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    unlink.push(() => ctx.signal.removeEventListener('abort', onAbort));
    if (ctx.signal.aborted) ac.abort(ctx.signal.reason);
    controllers.set(role, ac);
    contexts.set(role, {
      ...ctx, signal: ac.signal, session: o.session,
      progress: (p, source) => {
        pct.set(role, Math.max(pct.get(role)!, p));
        // The second visual review sits in the 80–90 % band (the three first-pass reviewers filled the first 80).
        ctx.progress(Math.min(99, o.second ? 80 + p * 0.1 : ([...pct.values()].reduce((a, v) => a + v, 0) / pct.size) * 0.8), source);
      },
      status: (s, note) => {
        if (s === 'waiting_limit') waiting.add(role); else waiting.delete(role);
        if (waiting.size) ctx.status('waiting_limit', note); else ctx.status(s, note);
      },
    });
  }
  return {
    contexts,
    abortOthers: (role: FinalReviewerRole) => { for (const [r, ac] of controllers) if (r !== role) ac.abort(new Error(`kardeş reviewer başarısız: ${role}`)); },
    /** A role that ended no longer holds the step in waiting_limit. */
    end: (role: FinalReviewerRole) => { waiting.delete(role); },
    done: () => { for (const u of unlink) u(); },
  };
}

interface Inputs {
  video: string; durationS: number; frames: number; sheetRel: string; sheetTimes: number[]; hookRel: string; hookTimes: number[];
  storyboard: Storyboard; scene: SceneSpec; research: ProductResearch; qc: QcReport; targets: WebTarget[]; mixed64?: number;
}

/**
 * Spec §7.1 step 10 (plan T7): the three reviewers (visual, facts, retention) review the music final in parallel isolated sessions, the panel
 * score and the K13 verdict are computed (shared), a borderline total gets a second visual review, the round is recorded, and the loop acts:
 * ready → done; stop → done with the reason; rework → final rewind to storyboard; fix → the fixer (T8; none → no_fixer).
 */
export function reviewExecutor(deps: StepDeps, opts: { pollMs?: number } = {}): StepExecutor {
  const pollMs = opts.pollMs ?? 5000;

  async function act(ctx: StepContext, hash: string, v: StoredVerdict, findings: FixFinding[], replay = false): Promise<StepOutcome> {
    const usageBlocked = !!deps.gate && !deps.gate.allowsNewPipeline();
    const a = loopAction({ verdict: v.verdict, fixRound: ctx.fixRound, oscillating: v.oscillating.length > 0, usageBlocked, declarationFailed: false });
    if (a.kind === 'ready') return { status: 'done', note: `Yayına hazır: ${formatScore(v.total!)} puan` };
    const stop = async (reason: LoopStop): Promise<StepOutcome> => {
      // A replay of a stored verdict decides again but does not audit the same stop twice.
      if (!replay) await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'loop.stop', runId: ctx.runId, stepId: ctx.stepId, data: { reason, fixRound: ctx.fixRound, verdict: v.verdict, total: v.total } });
      return { status: 'done', note: `${STOP_NOTE[reason]}${v.total !== null ? `: ${formatScore(v.total)} puan` : ''}` };
    };
    if (a.kind === 'stop') return stop(a.reason);
    if (a.kind === 'fix' && !deps.fixer) return stop('no_fixer');
    // F13: the version row exists before anything the fixer or the next round writes (artifacts.version_id is a foreign key).
    const round = ctx.fixRound + 1;
    const versionId = fixVersionId(ctx.runId, round);
    await insertVersion(deps.pool, { id: versionId, videoId: ctx.videoId, parentVersionId: ctx.versionId, round, reason: 'fix:pending' });
    if (a.kind === 'rework') {
      return { status: 'rewind', to: 'storyboard', loop: 'final', reason: `puan < 70 (${formatScore(v.total!)})${v.failed.length ? `: ${openLabels(v.failed)}` : ''}`, version: { id: versionId, reason: 'fix:rework' } };
    }
    return deps.fixer!(deps, ctx, { hash, round, versionId, verdict: v.verdict, findings });
  }

  return {
    key: 'review',
    resource: 'claude',
    async inputHash(ctx) {
      const [m, q] = await Promise.all(['final_video_music', 'qc_report'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
      return sha({ step: 'review', music: m?.blobSha ?? null, qc: q?.id ?? null, rubric: RUBRIC_VERSION, fixRound: ctx.fixRound });
    },
    // No `reuse`: a stored verdict is decided again in run(), so a "fix" is never turned into "done" (plan C7).
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const [music, qcArt] = await Promise.all(['final_video_music', 'qc_report'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
      const blob = music?.blobSha ? await getBlob(deps.pool, music.blobSha) : null;
      const absent = [!music?.blobSha || !blob ? 'final_video_music' : null, !qcArt ? 'qc_report' : null].filter(Boolean);
      if (!music || !blob || !qcArt) return { status: 'failed', error: `incelenecek girdi yok: ${absent.join(', ')}`, retry: false };
      // Spec §8.3 / plan F23, before any LLM budget: the final must be made from the current scene, and the qc report measured this very music video.
      const { framesHash } = (music.meta ?? {}) as { framesHash?: string };
      const current = await finalSource(deps, ctx.runId);
      if (!current || framesHash !== current.hash || (qcArt.meta as { musicSha?: string } | null)?.musicSha !== music.blobSha) {
        return { status: 'failed', error: 'final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false };
      }
      const qc = QcReportSchema.safeParse(qcArt.content);
      const [sb, sc, rs] = await Promise.all(['storyboard', 'scene', 'research'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
      const storyboard = sb ? validateArtifact('Storyboard', sb.content) : null;
      const sceneSpec = sc ? validateArtifact('SceneSpec', sc.content) : null;
      const research = rs ? validateArtifact('ProductResearch', rs.content) : null;
      const invalid = [!qc.success ? 'qc_report' : null, !storyboard?.ok ? 'storyboard' : null, !sceneSpec?.ok ? 'scene' : null, !research?.ok ? 'research' : null].filter(Boolean);
      if (invalid.length) return { status: 'failed', error: `eksik ya da geçersiz girdi: ${invalid.join(', ')}`, retry: false };
      if (!qc.success || !storyboard?.ok || !sceneSpec?.ok || !research?.ok) throw new Error('unreachable');

      // A stored verdict of this very input decides again without a session (restart after the round was recorded).
      const storedVerdict = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'final_verdict', inputHash: hash });
      if (storedVerdict && isStoredVerdict(storedVerdict.content)) {
        return act(ctx, hash, storedVerdict.content, await openFindings(ctx, storedVerdict.content), true);
      }

      const dir = join(ctx.runDir, 'review', 'final', `r${ctx.fixRound}`);
      const rel = `review/final/r${ctx.fixRound}`;
      let reviews: Partial<Record<FinalReviewerRole, FinalReview>> | null = null;
      let second: FinalReview | null = null;
      const sessions = new Map<string, string | null>();
      let inputs: Inputs | null = null;
      let gaps: string[] = [];
      if (qc.data.pass) {
        const probe = await probeVideo(scene.ffmpeg, join(deps.dataDir, blob.path), ctx.signal);
        const frames = (await latestArtifact(deps.pool, ctx.runId, 'final_frames'))?.meta as FinalFramesMeta | null;
        inputs = {
          video: join(deps.dataDir, blob.path), durationS: probe.durationS, frames: probe.frames, sheetRel: `${rel}/sheet.png`, sheetTimes: sheetTimes(probe.durationS),
          hookRel: `${rel}/hook.png`, hookTimes: retentionTimes(storyboard.value, probe.durationS), storyboard: storyboard.value, scene: sceneSpec.value, research: research.value,
          qc: qc.data, targets: webCheckTargets(research.value, storyboard.value, `${ctx.runId}:${ctx.fixRound}`), ...(frames?.mixed64 ? { mixed64: frames.mixed64 } : {}),
        };
        gaps = numericGaps(research.value, storyboard.value);
        try {
          const r = await runPanel(ctx, hash, dir, inputs, music.inputHash, sessions);
          if ('outcome' in r) return r.outcome;
          ({ reviews, second } = r);
        } finally {
          deps.reviews?.delete(ctx.stepId);
        }
      }

      const merged = reviews && second ? { ...reviews, reviewer_visual: averageVisual(reviews.reviewer_visual!, second) } : reviews;
      const score = withGapGate(panelScore({ qc: qc.data, reviews: merged, g4: true }), gaps);
      const prior = roundChecks((await listRunReviews(deps.pool, ctx.runId)).filter((r) => r.round < ctx.fixRound));
      const evaluated = reviews ? FINAL_REVIEWER_ROLES.flatMap((role) => checksOf(role) as string[]) : [];
      const passed = [...evaluated, ...QC_JUDGED].filter((id) => !score.failed.includes(id));
      const verdict = finalVerdict(score);
      const history = checkHistory([...prior.map(({ regressed: _r, ...p }) => p), { round: ctx.fixRound, versionId: ctx.versionId, total: score.total, verdict, failed: score.failed, passed }]);
      const status = (id: string): NewFinding['status'] => (history.regressed.includes(id) ? 'regressed' : 'open');

      const rows: NewReview[] = [];
      const findingsOf = (r: FinalReview): NewFinding[] => r.checks.filter((c) => !c.pass).map((c) => ({
        checkId: c.id, severity: FINAL_CHECKS[c.id].severity, dimension: FINAL_CHECKS[c.id].dimension, gate: FINAL_CHECKS[c.id].gate, evidence: c.evidence, fixHint: c.fix_hint, status: status(c.id),
      }));
      const orchestrator: NewFinding[] = [];
      for (const id of score.failed.filter((x) => !(x in FINAL_CHECKS))) {
        const c = [...qc.data.music, ...qc.data.tiktok].find((x) => x.id === id && !x.pass);
        const def = QC_CHECKS[id as keyof typeof QC_CHECKS];
        orchestrator.push({ checkId: id, severity: def.gate ? 'blocker' : 'minor', dimension: def.dimension ?? null, gate: def.gate ?? null, evidence: c ? { value: c.value, limit: c.limit, ...(c.at !== undefined ? { at: c.at } : {}) } : null, status: status(id) });
      }
      // The deterministic G2 failure (a numeric claim without a rule-satisfying source), unless the facts reviewer already failed the check itself.
      if (gaps.length && !reviews?.reviewer_facts?.checks.some((c) => c.id === 'claims_verified' && !c.pass)) {
        const claimId = gaps[0]!.split(':')[0]!;
        const beat = storyboard.value.beats.find((b) => b.claim_ids.includes(claimId));
        const frame = Math.min(Math.max(0, (inputs?.frames ?? 1) - 1), Math.round((beat?.t_start ?? 0) * FPS));
        orchestrator.push({
          checkId: 'claims_verified', severity: 'blocker', dimension: null, gate: 'G2', status: status('claims_verified'),
          evidence: { frame, timecode: Math.round((frame / FPS) * 100) / 100 }, fixHint: `Kaynağı yetersiz sayısal iddia: ${gaps[0]}. Ekrandaki iddiayı çıkar ya da yeniden yaz.`,
        });
      }
      rows.push({
        reviewerRole: 'orchestrator', seq: 1, rubricVersion: RUBRIC_VERSION, stepId: ctx.stepId, total: score.total, dimensionScores: score.dimensions, gates: score.gates, verdict,
        summaryTr: score.total === null ? 'Otomatik kapı geçmedi; reviewer çalışmadı.' : `Toplam ${formatScore(score.total)} puan · karar: ${verdict}`, findings: orchestrator,
      });
      for (const role of FINAL_REVIEWER_ROLES) {
        const r = reviews?.[role];
        if (!r) continue;
        const s = scoreReview(r);
        // With a second visual review the first row's findings are the merged outcome (the average decided the round, and history and the fixer read it);
        // the second row and both stored artifacts stay raw.
        const decided = role === 'reviewer_visual' && second ? merged!.reviewer_visual! : r;
        rows.push({ reviewerRole: role, seq: 1, rubricVersion: RUBRIC_VERSION, stepId: ctx.stepId, sessionId: sessions.get(ROLE_KIND[role]) ?? null, dimensionScores: s.dimensions, gates: s.gates, summaryTr: r.summary_tr, findings: findingsOf(decided) });
      }
      if (second) {
        const s = scoreReview(second);
        rows.push({ reviewerRole: 'reviewer_visual', seq: 2, rubricVersion: RUBRIC_VERSION, stepId: ctx.stepId, sessionId: sessions.get(SECOND_KIND) ?? null, dimensionScores: s.dimensions, gates: s.gates, summaryTr: second.summary_tr, findings: findingsOf(second) });
      }
      await recordReviewRound(deps.pool, { runId: ctx.runId, round: ctx.fixRound, versionId: ctx.versionId, rows, fixed: history.fixed });

      const stored: StoredVerdict = { verdict, total: score.total, dimensions: score.dimensions, gates: score.gates, low: score.low, failed: score.failed, regressed: history.regressed, fixed: history.fixed, oscillating: history.oscillating };
      await mkdir(dir, { recursive: true });
      const file = join(dir, 'verdict.json');
      await writeFile(file, JSON.stringify(stored, null, 2));
      await record(deps, ctx, { kind: 'final_verdict', file, content: stored, inputHash: hash, meta: { fixRound: ctx.fixRound, verdict } });
      await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'review.verdict', runId: ctx.runId, stepId: ctx.stepId, data: { round: ctx.fixRound, verdict, total: score.total, failedGates: score.failedGates, low: score.low } });
      return act(ctx, hash, stored, await openFindings(ctx, stored));
    },
  };

  /** The failed checks of the round as the fixer reads them (reviewer hints; qc checks carry their measurement). */
  async function openFindings(ctx: StepContext, v: StoredVerdict): Promise<FixFinding[]> {
    const rows = (await listRunReviews(deps.pool, ctx.runId)).filter((r) => r.round === ctx.fixRound && r.seq === 1);
    const found = rows.flatMap((r) => r.findings.map((f) => ({ check_id: f.checkId, severity: f.severity, evidence: f.evidence, fix_hint: f.fixHint })));
    return v.failed.flatMap((id) => found.filter((f) => f.check_id === id).slice(0, 1));
  }

  /** The reviewers' sessions, the sheets they read and the stored role outputs (plan F9, F24). Returns the reviews (and the second visual one) or the step's outcome. */
  async function runPanel(
    ctx: StepContext, hash: string, dir: string, i: Inputs, composeHash: string | null, sessions: Map<string, string | null>,
  ): Promise<{ reviews: Record<FinalReviewerRole, FinalReview>; second: FinalReview | null } | { outcome: StepOutcome }> {
    const scene = deps.scene!;
    const have = async (kind: string, role: FinalReviewerRole): Promise<FinalReview | null> => {
      const a = await findArtifact(deps.pool, { runId: ctx.runId, kind, inputHash: hash });
      const v = a ? validateArtifact('FinalReview', a.content) : null;
      if (!a || !v?.ok || v.value.reviewer_role !== role) return null;
      sessions.set(kind, (a.meta as { sessionId?: string } | null)?.sessionId ?? null);
      return v.value;
    };
    // The step card links the first session only; later sessions of the panel do not replace it.
    let linked = false;
    const session = (id: string) => { if (!linked) { linked = true; ctx.session(id); } };
    const stored: Partial<Record<FinalReviewerRole, FinalReview>> = {};
    for (const role of FINAL_REVIEWER_ROLES) { const r = await have(ROLE_KIND[role], role); if (r) stored[role] = r; }
    const missing = FINAL_REVIEWER_ROLES.filter((r) => !stored[r]);

    let prompts: Promise<Record<FinalReviewerRole, string>> | null = null;
    // Memoised as a promise: the three roles ask at once and the sheets are made once.
    const preparePrompts = () => (prompts ??= buildPrompts());
    const buildPrompts = async (): Promise<Record<FinalReviewerRole, string>> => {
      await mkdir(dir, { recursive: true });
      const sheet = async (times: number[], sub: string, out: string, rows: number, kind: 'main' | 'hook') => {
        // A restart finds its sheets: nothing is extracted or recorded twice.
        const had = await deps.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'final_review_sheet' AND input_hash = $2 AND meta->>'kind' = $3", [ctx.runId, hash, kind]);
        if (had.rowCount && existsSync(join(dir, out))) return;
        await mkdir(join(dir, sub), { recursive: true });
        for (const [n, at] of times.entries()) await extractFrame(scene.ffmpeg, i.video, join(dir, sub, `f${String(n).padStart(5, '0')}.png`), { t: at, width: 540, signal: ctx.signal });
        await contactSheet(scene.ffmpeg, join(dir, sub), join(dir, out), { cols: 4, rows, signal: ctx.signal });
        await record(deps, ctx, { kind: 'final_review_sheet', file: join(dir, out), inputHash: hash, meta: { fixRound: ctx.fixRound, kind, times } });
      };
      await sheet(i.sheetTimes, 'sheet', 'sheet.png', 3, 'main');
      await sheet(i.hookTimes, 'hooksheet', 'hook.png', 2, 'hook');
      const [events, layout] = await Promise.all([
        latestArtifact(deps.pool, ctx.runId, 'scene_events'),
        composeHash ? findArtifact(deps.pool, { runId: ctx.runId, kind: 'layout', inputHash: composeHash }) : null,
      ]);
      const ev = events ? SceneEventsSchema.safeParse(events.content) : null;
      const common = { name: ctx.productName, durationS: i.durationS, frames: i.frames, times: i.sheetTimes, sheet: i.sheetRel };
      return {
        reviewer_visual: visualPrompt({
          ...common, storyboard: i.storyboard, scene: i.scene, qc: qcFacts('reviewer_visual', i.qc), hooks: await recentHooks(deps.pool, ctx.videoId), ...(i.mixed64 ? { mixed64: i.mixed64 } : {}),
          facts: manifestFacts({ events: ev?.success ? currentEvents(ev.data.events, i.storyboard.beats, FPS) : [], beats: i.storyboard.beats, layout: (layout?.content as LayoutManifest | null) ?? null, fps: FPS, durationS: i.durationS }),
        }),
        reviewer_facts: factsPrompt({ ...common, research: i.research, storyboard: i.storyboard, targets: i.targets }),
        reviewer_retention: retentionPrompt({ ...common, storyboard: i.storyboard, qc: qcFacts('reviewer_retention', i.qc), hookSheet: i.hookRel, hookTimes: i.hookTimes }),
      };
    };
    const register = (role: FinalReviewerRole, seq: number) => deps.reviews?.set(ctx.stepId, {
      role, seq, round: ctx.fixRound, video: i.video, frames: i.frames, fps: FPS, durationS: i.durationS, outDir: join(dir, 'frames', seq === 1 ? role : `${role}-${seq}`), qc: i.qc,
    });
    /** One reviewer session (with its same-session contract fixes); the validated output is stored for replay. */
    const review = async (role: FinalReviewerRole, seq: 1 | 2, rctx: StepContext, kind: string) => {
      const p = await preparePrompts();
      if (rctx.signal.aborted) return { ok: false as const, cancelled: true, error: 'durduruldu', sessionIds: [] as string[] };
      // A restarted first-pass reviewer continues its own session of this round; a second visual review always starts fresh (independence).
      const prior = seq === 1 && ctx.attempt > 1 ? await priorSession(deps.pool, ctx, role) : null;
      const r = await runStructured<FinalReview>({
        manager: deps.manager, ctx: rctx, role, schema: 'FinalReview', prompt: p[role],
        initialResume: prior ? { claudeSessionId: prior.claudeSessionId, parent: prior.id, prompt: RESUME_PROMPT } : undefined,
        check: (v) => finalReviewRefErrors(v, { role, frames: i.frames, fps: FPS, ...(role === 'reviewer_facts' ? { webTargets: i.targets } : {}) }),
        fakeScript: deps.fakeScript ? (n) => deps.fakeScript!(role, ctx, n, seq === 2 ? { seq: 2 } : undefined) : undefined,
      });
      if (!r.ok) return r;
      const file = join(dir, `${kind}.json`);
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify(r.value, null, 2));
      const sessionId = r.sessionIds.at(-1) ?? null;
      await record(deps, ctx, { kind, file, content: r.value, inputHash: hash, meta: { fixRound: ctx.fixRound, seq, sessionId } });
      sessions.set(kind, sessionId);
      return r;
    };

    if (missing.length) {
      if (!(await awaitGate(deps, ctx, pollMs))) return { outcome: { status: 'cancelled' } };
      for (const role of missing) register(role, 1);
      const p = panelContexts(ctx, missing, { session });
      try {
        const results = await Promise.allSettled(missing.map(async (role) => {
          try {
            const r = await review(role, 1, p.contexts.get(role)!, ROLE_KIND[role]);
            if (!r.ok && !r.cancelled) p.abortOthers(role);
            return { role, r };
          } catch (e) {
            p.abortOthers(role);
            throw e;
          } finally {
            p.end(role);
          }
        }));
        for (const x of results) if (x.status === 'rejected') throw x.reason;
        const all = results.map((x) => (x as PromiseFulfilledResult<{ role: FinalReviewerRole; r: Awaited<ReturnType<typeof review>> }>).value);
        if (ctx.signal.aborted) return { outcome: { status: 'cancelled' } };
        const bad = all.find((x) => !x.r.ok && !x.r.cancelled) ?? all.find((x) => !x.r.ok);
        if (bad && !bad.r.ok) return { outcome: failure({ cancelled: bad.r.cancelled, error: `${ROLE_LABEL[bad.role]}: ${bad.r.error}` }) };
        for (const x of all) if (x.r.ok) stored[x.role] = x.r.value;
      } finally {
        p.done();
      }
    }
    const reviews = stored as Record<FinalReviewerRole, FinalReview>;

    // §8.3: a total within 78–82 (gates passed) earns one independent second visual review; its output is stored like the others.
    const gaps = numericGaps(i.research, i.storyboard);
    const first = withGapGate(panelScore({ qc: i.qc, reviews, g4: true }), gaps);
    if (!isBorderline(first)) return { reviews, second: null };
    let second = await have(SECOND_KIND, 'reviewer_visual');
    if (!second) {
      if (!(await awaitGate(deps, ctx, pollMs))) return { outcome: { status: 'cancelled' } };
      register('reviewer_visual', 2);
      const p = panelContexts(ctx, ['reviewer_visual'], { session, second: true });
      try {
        const r = await review('reviewer_visual', 2, p.contexts.get('reviewer_visual')!, SECOND_KIND);
        if (!r.ok) return { outcome: failure({ cancelled: r.cancelled, error: `ikinci görsel reviewer: ${r.error}` }) };
        second = r.value;
      } finally {
        p.done();
      }
    }
    return { reviews, second };
  }
}
