import type pg from 'pg';
import { FINAL_CHECKS, QC_CHECKS, type FinalCheckId, type FixReport, type Storyboard } from '@videogen/shared';
import { listRunReviews } from '@videogen/db';
import { fenced } from './fence.ts';
import type { FixFinding } from './review-step.ts';

/** Plan F12 (leaf module: the step executors and the fixer both read the round's cause from here). */

/** What a round's fix report stores next to the report (plan T8 step 5): the computed scope is the truth, the claim is only a claim. */
export interface FixMeta {
  /** The reviewed round (`final_verdict` carries the same number). */
  fixRound: number;
  scope: 'none' | 'compose' | 'build';
  changed: string[];
  versionId: string;
  claimed: FixReport['rerender_scope'];
}

/** Plan F12: why the current round exists. Read only from the previous round's artifacts, so an older round never leaks in (independent review B1). */
export interface RoundCause {
  kind: 'compose' | 'build' | 'rework';
  verdictId: string;
  fixReportId: string | null;
  failed: string[];
}

/** The newest artifact of `kind` whose meta carries `fixRound` (the reviewed round the artifact belongs to). */
async function ofRound(pool: pg.Pool, runId: string, kind: string, fixRound: number) {
  const { rows } = await pool.query(
    "SELECT id, content, meta FROM artifacts WHERE run_id = $1 AND kind = $2 AND meta->>'fixRound' = $3 ORDER BY created_at DESC LIMIT 1",
    [runId, kind, String(fixRound)],
  );
  return (rows[0] as { id: string; content: unknown; meta: Partial<FixMeta> } | undefined) ?? null;
}

/**
 * Plan F12: the one place that says how round `fixRound` (≥ 1) came about. A verdict `rework`, or a fixer that claimed a storyboard rewrite and
 * changed nothing, is `rework`; otherwise the fix report's computed scope. Null: no recorded cause (the step behaves as on a first pass).
 */
export async function roundCause(pool: pg.Pool, runId: string, fixRound: number): Promise<RoundCause | null> {
  if (fixRound < 1) return null;
  const verdict = await ofRound(pool, runId, 'final_verdict', fixRound - 1);
  if (!verdict) return null;
  const v = verdict.content as { verdict?: string; failed?: string[] } | null;
  const failed = Array.isArray(v?.failed) ? v.failed : [];
  if (v?.verdict === 'rework') return { kind: 'rework', verdictId: verdict.id, fixReportId: null, failed };
  const report = await ofRound(pool, runId, 'fix_report', fixRound - 1);
  if (!report) return null;
  const { scope, claimed } = report.meta;
  if (scope === 'none' && claimed === 'storyboard') return { kind: 'rework', verdictId: verdict.id, fixReportId: report.id, failed };
  if (scope === 'compose' || scope === 'build') return { kind: scope, verdictId: verdict.id, fixReportId: report.id, failed };
  return null;
}

/** Cause ids for the step hashes (plan F12): a round without a cause adds nothing, so a first pass keeps its hash. */
export const causeKey = (c: RoundCause | null) => (c ? { kind: c.kind, verdict: c.verdictId, fixReport: c.fixReportId } : null);

export const checkOwner = (id: string) => (id in FINAL_CHECKS ? FINAL_CHECKS[id as FinalCheckId].owner : 'qc');
export const labelOf = (id: string) => (id in FINAL_CHECKS ? FINAL_CHECKS[id as FinalCheckId].label_tr : QC_CHECKS[id as keyof typeof QC_CHECKS]?.label_tr ?? id);
export const findingRows = (findings: FixFinding[]) => findings.map((f) => ({ id: f.check_id, etiket: labelOf(f.check_id), sahip: checkOwner(f.check_id), onem: f.severity, kanit: f.evidence ?? null, ipucu: f.fix_hint ?? null }));

/** The failed checks of reviewed round `round` as the review recorded them (first-pass rows; the orchestrator row carries the qc measurements). */
export async function roundFindings(pool: pg.Pool, runId: string, round: number, failed: string[]): Promise<FixFinding[]> {
  const rows = (await listRunReviews(pool, runId)).filter((r) => r.round === round && r.seq === 1);
  const found = rows.flatMap((r) => r.findings.map((f) => ({ check_id: f.checkId, severity: f.severity, evidence: f.evidence, fix_hint: f.fixHint })));
  return failed.flatMap((id) => found.filter((f) => f.check_id === id).slice(0, 1));
}

/** The storyboard step of a rework round (F12): the failed findings, fenced, and the instruction to rewrite. */
export const reworkStoryboardPrompt = (findings: FixFinding[]) => [
  fenced('Final incelemesi bulguları', findingRows(findings)),
  '',
  "Önceki storyboard final incelemesinden geçemedi (puan < 70). Storyboard'u bu bulgulara göre yeniden yaz: yalnızca bulguların işaret ettiği sorunları çöz, araştırmadaki parça ve iddia kimlikleri dışına çıkma.",
].join('\n');

/** The builder of a rework round (F12): its session continues; it learns that the storyboard was rewritten and what the new one says. */
export const reworkBuildPrompt = (storyboard: Storyboard) => [
  "Storyboard yeniden yazıldı (final incelemesi bulguları). Sahneyi (product.py ve SceneSpec) yeni storyboard'a göre güncelle; parça, zaman ve kamera değiştiyse build_scene ve render_preview_stills ile kontrol et.",
  '',
  fenced('Yeni storyboard', storyboard),
].join('\n');
