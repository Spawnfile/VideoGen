import { z } from 'zod';

/** Spec §8.2: the dimensions reviewer_visual owns in the draft review, with their §8.1 weights (the score ceiling). */
export const DRAFT_DIMENSIONS = { D2: 15, D3: 12, D5: 10, D9: 8 } as const;
export type DraftDimension = keyof typeof DRAFT_DIMENSIONS;
/** Gates reviewer_visual judges on the frames (spec §8.2: G3 visual part, G5 "CG presented as real"). */
export const DRAFT_GATES = ['G3', 'G5'] as const;
export type DraftGate = (typeof DRAFT_GATES)[number];

export type DraftSeverity = 'blocker' | 'major' | 'minor';
export interface DraftCheck { severity: DraftSeverity; dimension: DraftDimension; label_tr: string; ask_tr: string }

export const DRAFT_CHECK_IDS = ['hero_frame0', 'mechanism_shot', 'parts_visible', 'no_intersection', 'labels_correct', 'text_readable', 'motion_flow', 'no_slop'] as const;
export type DraftCheckId = (typeof DRAFT_CHECK_IDS)[number];

/**
 * Plan C3 (inherited D6): the severity belongs to the check id, never to the reviewer. Not asked, because deterministic: safe-area
 * text (G6) and the ≤ 6 label limit (Draft3D places labels by construction, packages/remotion placeLabels), BVH overlaps
 * (build.json). `no_intersection` is minor: z-fighting at 540×960 is a noisy call and a major would buy a whole opus build round.
 */
export const DRAFT_CHECKS: Record<DraftCheckId, DraftCheck> = {
  hero_frame0: { severity: 'blocker', dimension: 'D2', label_tr: 'Kahraman ilk karede', ask_tr: '0. karede kahraman nesne büyük (kadraj yüksekliğinin yaklaşık %35\'i ya da fazlası), net ve tanınır mı?' },
  mechanism_shot: { severity: 'major', dimension: 'D2', label_tr: 'Mekanizma çekimi', ask_tr: 'Mekanizma vuruşunda mekanizmanın çalıştığı yer yakın planda ve anlaşılır görünüyor mu?' },
  parts_visible: { severity: 'major', dimension: 'D2', label_tr: 'Parçalar görünür', ask_tr: 'Her vuruşun konusu olan parça kadrajda, seçilebilir ve başka parçanın arkasında kalmıyor mu?' },
  no_intersection: { severity: 'minor', dimension: 'D2', label_tr: 'İç içe geçme yok', ask_tr: 'Parçalar birbirinin içinden geçmiyor; z-fighting, titreme ya da kopuk parça yok mu?' },
  labels_correct: { severity: 'major', dimension: 'D5', label_tr: 'Etiketler doğru', ask_tr: 'Her etiket çizgisi adını taşıdığı parçaya mı bitiyor?' },
  text_readable: { severity: 'minor', dimension: 'D5', label_tr: 'Yazılar okunur', ask_tr: 'Ekran yazıları ve etiketler arka planla yeterli kontrastta ve okunur boyutta mı?' },
  motion_flow: { severity: 'minor', dimension: 'D3', label_tr: 'Hareket akışı', ask_tr: '0,5 sn\'den uzun donma yok ve yaklaşık her 2 sn\'de bir görsel olay var mı?' },
  no_slop: { severity: 'minor', dimension: 'D9', label_tr: 'Özgünlük', ask_tr: 'Ekranda emoji ya da kalıp (slop) ifade yok ve CG gerçek çekim gibi sunulmuyor mu?' },
};
export const DRAFT_RUBRIC_VERSION = 'draft@1';
/** Inherited D5: at most two returns to build (three reviews); the third failing review stops the run (needs_human). */
export const DRAFT_MAX_RETURNS = 2;

const unit = z.number().min(0).max(1);
const tr = (max: number) => z.string().trim().min(1).max(max);
const EvidenceSchema = z.object({
  /** Frame number of the draft video (0-based). */
  frame: z.number().int().min(0),
  /** Seconds; must agree with frame / 30 within 0.5 s (reviewRefErrors). */
  timecode: z.number().min(0),
  /** Optional region, fractions of the frame. */
  crop: z.object({ x: unit, y: unit, w: unit, h: unit }).optional(),
});
const ReviewCheckSchema = z.object({
  id: z.enum(DRAFT_CHECK_IDS),
  pass: z.boolean(),
  score: unit,
  evidence: EvidenceSchema.optional(),
  fix_hint: tr(300).optional(),
});
/** Explicit properties, not z.record(enum): zod 4 would make every key required anyway and the CLI schema check of propertyNames is unverified (D6). */
const DimensionScoresSchema = z.object({
  D2: z.number().min(0).max(DRAFT_DIMENSIONS.D2),
  D3: z.number().min(0).max(DRAFT_DIMENSIONS.D3),
  D5: z.number().min(0).max(DRAFT_DIMENSIONS.D5),
  D9: z.number().min(0).max(DRAFT_DIMENSIONS.D9),
});
const GateResultsSchema = z.object({ G3: z.boolean(), G5: z.boolean() });

const ReviewBase = z.object({
  rubric_version: z.literal(DRAFT_RUBRIC_VERSION),
  reviewer_role: z.literal('reviewer_visual'),
  checks: z.array(ReviewCheckSchema).length(DRAFT_CHECK_IDS.length),
  dimension_scores: DimensionScoresSchema,
  gate_results: GateResultsSchema,
  summary_tr: tr(400),
});
export type Review = z.infer<typeof ReviewBase>;
export type ReviewCheck = Review['checks'][number];

export const ReviewSchema = ReviewBase.superRefine((r, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const seen = new Set<string>();
  r.checks.forEach((c, i) => {
    if (seen.has(c.id)) issue(['checks', i, 'id'], `tekrarlanan kontrol: ${c.id}`);
    seen.add(c.id);
    if (!c.pass && !c.evidence) issue(['checks', i, 'evidence'], 'başarısız kontrolde kanıt (kare ve zaman kodu) zorunlu');
    if (!c.pass && !c.fix_hint) issue(['checks', i, 'fix_hint'], 'başarısız kontrolde düzeltme ipucu zorunlu');
  });
  for (const id of DRAFT_CHECK_IDS) if (!seen.has(id)) issue(['checks'], `eksik kontrol: ${id}`);
});

/** Cross-checks against the draft that was actually reviewed (same-session fix requests, like storyboardRefErrors). */
export function reviewRefErrors(r: Review, draft: { frames: number; fps: number }): string[] {
  const out: string[] = [];
  r.checks.forEach((c, i) => {
    if (!c.evidence) return;
    if (c.evidence.frame >= draft.frames) out.push(`checks.${i}.evidence.frame: taslakta ${draft.frames} kare var (0–${draft.frames - 1})`);
    if (Math.abs(c.evidence.frame / draft.fps - c.evidence.timecode) > 0.5) out.push(`checks.${i}.evidence.timecode: kare ${c.evidence.frame} ≈ ${(c.evidence.frame / draft.fps).toFixed(2)} sn olmalı`);
  });
  return out;
}

export interface DraftDecision { verdict: 'pass' | 'revise'; blocking: DraftCheckId[]; minor: DraftCheckId[]; gates: DraftGate[] }

/** Deterministic (D6): a failed blocker or major check, or a failed gate, sends the draft back; minor failures only go to the note. Scores never decide. */
export function draftDecision(r: Review): DraftDecision {
  const failed = r.checks.filter((c) => !c.pass);
  const blocking = failed.filter((c) => DRAFT_CHECKS[c.id].severity !== 'minor').map((c) => c.id);
  const minor = failed.filter((c) => DRAFT_CHECKS[c.id].severity === 'minor').map((c) => c.id);
  const gates = DRAFT_GATES.filter((g) => !r.gate_results[g]);
  return { verdict: blocking.length || gates.length ? 'revise' : 'pass', blocking, minor, gates };
}
