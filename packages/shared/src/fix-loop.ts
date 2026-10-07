import type { ProductResearch, Storyboard, FixReport } from './artifacts.ts';
import { FINAL_CHECKS, FINAL_MAX_ROUNDS, type FinalCheckId } from './final-review.ts';
import { QC_CHECKS, type QcCheckId } from './qc.ts';
import type { SceneSpec } from './scene.ts';

/** Plan F3/F11/F14/F15: the pure logic of the final fix loop. Types only from artifacts.ts (no value cycle). */
export const RERENDER_SCOPES = ['compose', 'voice', 'build', 'storyboard'] as const;
export type RerenderScope = (typeof RERENDER_SCOPES)[number];

/** Every failed check is accounted for exactly once; the round matches; voice is not in reach before M5c. */
export function fixReportRefErrors(r: FixReport, o: { round: number; failed: string[] }): string[] {
  const out: string[] = [];
  if (r.round !== o.round) out.push(`round: ${o.round} olmalı`);
  const listed = [...r.addressed.map((a) => a.check_id), ...r.not_addressed.map((n) => n.check_id)];
  for (const id of o.failed) if (!listed.includes(id)) out.push(`${id}: addressed ya da not_addressed içinde olmalı`);
  for (const id of new Set(listed)) if (!o.failed.includes(id)) out.push(`${id}: başarısız kontroller arasında değil`);
  if (r.rerender_scope === 'voice') out.push("rerender_scope: seslendirme kapsamı M5c'de");
  return out;
}

/** JSON with sorted keys: equal values give equal strings whatever the key order. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** The scene as Blender and the final render see it: the Turkish label and the recipe note render nothing (F11). */
export function sceneRender(scene: SceneSpec): unknown {
  return { ...scene, parts: scene.parts.map((p) => ({ ...p, name_tr: null, recipe: { ...p.recipe, note: null } })) };
}

export type ScopeChange = 'product.py' | 'scene.render' | 'storyboard.structure' | 'scene.labels' | 'storyboard.text' | 'research';
export interface ScopeInput { storyboard: Storyboard; scene: SceneSpec; research: ProductResearch; productSha: string }

/** On-screen text the overlay and the SFX list read: the hook line, each beat's text and its SFX cue words (props.ts draftProps, sound.ts planSfx). */
function storyboardText(s: Storyboard): unknown {
  return { hook: s.hook.text_tr, beats: s.beats.map((b) => ({ text: b.onscreen_text.tr, sfx: b.sfx_cues })) };
}
/** Everything else the storyboard says (timing, parts, claims, camera, pattern, VO …) except the fields nothing reads: version, cta, loop_strategy. */
function storyboardStructure(s: Storyboard): unknown {
  const { version: _v, cta: _c, loop_strategy: _l, hook, beats, ...rest } = s;
  return { ...rest, hook: { pattern: hook.pattern }, beats: beats.map(({ onscreen_text: _t, sfx_cues: _s, ...b }) => b) };
}
const labels = (scene: SceneSpec) => scene.parts.map((p) => ({ id: p.id, name_tr: p.name_tr }));

/**
 * F11: the step computes the scope, the fixer's own claim is only a claim. build = product.py or the scene's render fields changed;
 * compose = any other storyboard field or a part label; none = nothing that renders or is reviewed. A research change is reported but has no scope (the fixer may not change it).
 */
export function fixScope(i: { prev: ScopeInput; next: ScopeInput }): { scope: 'none' | 'compose' | 'build'; changed: ScopeChange[] } {
  const differs = (f: (x: ScopeInput) => unknown) => canonical(f(i.prev)) !== canonical(f(i.next));
  const changed: ScopeChange[] = [];
  if (i.prev.productSha !== i.next.productSha) changed.push('product.py');
  if (differs((x) => sceneRender(x.scene))) changed.push('scene.render');
  if (differs((x) => storyboardStructure(x.storyboard))) changed.push('storyboard.structure');
  if (differs((x) => labels(x.scene))) changed.push('scene.labels');
  if (differs((x) => storyboardText(x.storyboard))) changed.push('storyboard.text');
  if (differs((x) => x.research)) changed.push('research');
  const scope = changed.some((c) => c === 'product.py' || c === 'scene.render') ? 'build'
    : changed.some((c) => c !== 'research') ? 'compose' : 'none';
  return { scope, changed };
}

export interface RoundChecks {
  round: number;
  versionId: string | null;
  /** null when the reviewers did not run (an AUTO gate failed). */
  total: number | null;
  verdict: 'ready' | 'fix' | 'rework';
  /** Check ids (final and qc) that failed / passed this round; a check that was not evaluated is in neither. */
  failed: string[];
  passed: string[];
}

/** F14: regressions are only tracked on gate checks, checks worth ≥ 3 points and qc gate checks; the rest is noise. */
export function tracked(id: string): boolean {
  if (Object.hasOwn(FINAL_CHECKS, id)) {
    const f = FINAL_CHECKS[id as FinalCheckId];
    return f.gate !== null || f.points >= 3;
  }
  return Object.hasOwn(QC_CHECKS, id) && QC_CHECKS[id as QcCheckId].gate !== undefined;
}

/** Latest round's movement against the last earlier round that evaluated each check, plus tracked checks that went fail → pass → fail. */
export function checkHistory(rounds: RoundChecks[]): { regressed: string[]; fixed: string[]; oscillating: string[] } {
  const last = rounds.at(-1);
  if (!last) return { regressed: [], fixed: [], oscillating: [] };
  const earlier = rounds.slice(0, -1);
  const before = (id: string): boolean | null => {
    for (let k = earlier.length - 1; k >= 0; k--) {
      if (earlier[k]!.passed.includes(id)) return true;
      if (earlier[k]!.failed.includes(id)) return false;
    }
    return null;
  };
  const regressed = last.failed.filter((id) => tracked(id) && before(id) === true);
  const fixed = last.passed.filter((id) => before(id) === false);
  const oscillating: string[] = [];
  for (const id of new Set(rounds.flatMap((r) => r.failed))) {
    if (!tracked(id)) continue;
    // evaluated states only, consecutive equal ones collapsed: F,P,P,F is as much a swing as F,P,F
    const seq = rounds.flatMap((r) => (r.failed.includes(id) ? [false] : r.passed.includes(id) ? [true] : [])).filter((v, k, a) => k === 0 || v !== a[k - 1]);
    if (seq.some((v, k) => !v && seq[k + 1] === true && seq[k + 2] === false)) oscillating.push(id);
  }
  return { regressed, fixed, oscillating };
}

export type LoopStop = 'limit' | 'oscillation' | 'unchanged' | 'usage' | 'no_fixer';
/** Turkish reasons shown on the step card and by finalize (runbook §7). */
export const STOP_NOTE: Record<LoopStop, string> = {
  limit: `${FINAL_MAX_ROUNDS} düzeltme turundan sonra eşik geçilemedi`,
  oscillation: 'aynı kontrol düzelip yeniden bozuldu; döngü durduruldu',
  unchanged: 'düzeltme turu hiçbir şeyi değiştirmedi',
  usage: 'kullanım sınırı yakın; yeni düzeltme turu başlatılmadı',
  no_fixer: 'düzeltme yapacak ajan bağlı değil',
};

export type LoopAction = { kind: 'ready' | 'fix' | 'rework' } | { kind: 'stop'; reason: LoopStop };

/** F15 order: ready; round limit; usage guard; oscillation; rework; fix. */
export function loopAction(i: { verdict: 'ready' | 'fix' | 'rework'; fixRound: number; oscillating: boolean; usageBlocked: boolean }): LoopAction {
  if (i.verdict === 'ready') return { kind: 'ready' };
  if (i.fixRound >= FINAL_MAX_ROUNDS) return { kind: 'stop', reason: 'limit' };
  if (i.usageBlocked) return { kind: 'stop', reason: 'usage' };
  if (i.oscillating) return { kind: 'stop', reason: 'oscillation' };
  return { kind: i.verdict };
}

/** F16: the newest ready round; else the highest total among rounds without a regression (all regressed: among all); ties go to the later round. A null total counts −1. */
export function pickBest<R extends RoundChecks & { regressed: boolean }>(rounds: R[]): R | null {
  const ready = rounds.filter((r) => r.verdict === 'ready').sort((a, b) => b.round - a.round)[0];
  if (ready) return ready;
  const clean = rounds.filter((r) => !r.regressed);
  const pool = clean.length ? clean : rounds;
  return [...pool].sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || b.round - a.round)[0] ?? null;
}
