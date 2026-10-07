import { z } from 'zod';
import type { DraftSeverity } from './review.ts';
import { buildQcReport, QC_CHECKS, type QcReport } from './qc.ts';
import { DIMENSIONS, DIMENSION_IDS, GATE_IDS, RUBRIC_VERSION, type DimensionId, type GateId } from './rubric.ts';

/** Plan F4/F5: the final review's contract. The reviewer scores only fixed-id checks; dimensions, gates and the K13 verdict are computed here. */
export const FINAL_REVIEWER_ROLES = ['reviewer_visual', 'reviewer_facts', 'reviewer_retention'] as const;
export type FinalReviewerRole = (typeof FINAL_REVIEWER_ROLES)[number];

/** Which fixer model a failure calls for (F19: visual/narrative → opus, factual/technical → sonnet). */
export type FixCategory = 'visual' | 'narrative' | 'factual' | 'technical';
/** Only orders the fixer's work and the UI; it never decides (F4). */
export type CheckSeverity = DraftSeverity;

export const READY_SCORE = 80;
export const REWORK_BELOW = 70;
/** Spec K13: every dimension must reach 60 % of its weight. */
export const DIMENSION_FLOOR = 0.6;
/** Spec §8.3: a total in this band (gates passed) gets a second, independent visual review. */
export const BORDERLINE = [78, 82] as const;
/** Plan D5/F3: at most three final fix rounds, counted apart from the draft rounds. */
export const FINAL_MAX_ROUNDS = 3;

export const FINAL_CHECK_IDS = [
  'hero_frame0', 'mechanism_shot', 'parts_visible', 'materials', 'no_intersection', 'contrast',
  'event_density', 'no_freeze', 'smooth_motion',
  'labels_correct', 'text_readable', 'text_dwell',
  'no_slop', 'no_genai_look', 'fresh_hook',
  'no_third_party', 'honest_cg',
  'claims_supported', 'info_density', 'mechanism_explained', 'engineer_insight', 'storyboard_match', 'claims_verified',
  'hook_frame0', 'hook_pattern', 'open_question', 'hook_text_short',
  'loop_seam', 'rehook', 'payoff',
] as const;
export type FinalCheckId = (typeof FINAL_CHECK_IDS)[number];

export interface FinalCheck {
  owner: FinalReviewerRole;
  dimension: DimensionId | null;
  gate: GateId | null;
  points: number;
  severity: CheckSeverity;
  category: FixCategory;
  label_tr: string;
  ask_tr: string;
}

const V = 'reviewer_visual', F = 'reviewer_facts', R = 'reviewer_retention';
const dim = (owner: FinalReviewerRole, dimension: DimensionId, points: number, severity: CheckSeverity, category: FixCategory, label_tr: string, ask_tr: string): FinalCheck =>
  ({ owner, dimension, gate: null, points, severity, category, label_tr, ask_tr });
const gate = (owner: FinalReviewerRole, g: GateId, category: FixCategory, label_tr: string, ask_tr: string): FinalCheck =>
  ({ owner, dimension: null, gate: g, points: 0, severity: 'blocker', category, label_tr, ask_tr });

/**
 * Spec §8.1/§8.2, plan F5 (30 checks): the points of a dimension's checks add up to its §8.1 weight; LLM 83 + D6 12 + D7 5 (qc) = 100.
 * Gate checks carry no points. G4 is a rule (M5b: always passes), G1/G6/G5-flash come from qc.
 */
export const FINAL_CHECKS: Record<FinalCheckId, FinalCheck> = {
  hero_frame0: dim(V, 'D2', 4, 'blocker', 'visual', 'Kahraman ilk karede', '0. karede kahraman nesne büyük (kadraj yüksekliğinin yaklaşık %35\'i ya da fazlası), net ve tanınır mı?'),
  mechanism_shot: dim(V, 'D2', 3, 'major', 'visual', 'Mekanizma çekimi', 'Mekanizma vuruşunda mekanizmanın çalıştığı yer yakın planda ve anlaşılır görünüyor mu?'),
  parts_visible: dim(V, 'D2', 3, 'major', 'visual', 'Parçalar görünür', 'Her vuruşun konusu olan parça kadrajda, seçilebilir ve başka parçanın arkasında kalmıyor mu?'),
  materials: dim(V, 'D2', 2, 'minor', 'visual', 'Malzeme ve ışık', 'Malzemeler inandırıcı ve ışık parçaları okunur kılıyor mu; yüzeyler düz ya da plastik görünmüyor mu?'),
  no_intersection: dim(V, 'D2', 2, 'minor', 'visual', 'İç içe geçme yok', 'Parçalar birbirinin içinden geçmiyor; z-fighting, titreme ya da kopuk parça yok mu?'),
  contrast: dim(V, 'D2', 1, 'minor', 'visual', 'Kontrast', 'Nesne ile arka plan arasında yeterli kontrast var mı ve kareler siyah ölçümüyle çelişen karanlık bölüm içermiyor mu?'),
  event_density: dim(V, 'D3', 5, 'major', 'visual', 'Olay sıklığı', 'Manifest olay aralığına göre yaklaşık her 2 sn\'de bir görsel olay var mı?'),
  no_freeze: dim(V, 'D3', 4, 'major', 'visual', 'Donma yok', 'qc donma ölçümüne göre 0,5 sn\'den uzun donma yok mu? (Yavaş CG hareketi donma sayılmaz.)'),
  smooth_motion: dim(V, 'D3', 3, 'minor', 'visual', 'Akıcı hareket', 'Hareket akıcı; ani sıçrama, titreme ya da kesik geçiş yok mu?'),
  labels_correct: dim(V, 'D5', 4, 'major', 'visual', 'Etiketler doğru', 'Her etiket çizgisi adını taşıdığı parçaya mı bitiyor?'),
  text_readable: dim(V, 'D5', 3, 'minor', 'visual', 'Yazılar okunur', 'Ekran yazıları ve etiketler arka planla yeterli kontrastta ve okunur boyutta mı?'),
  text_dwell: dim(V, 'D5', 3, 'minor', 'visual', 'Yazı kalma süresi', 'Manifest kalma süresine ve eşzamanlı etiket sayısına göre her yazı okunacak kadar ekranda kalıyor mu?'),
  no_slop: dim(V, 'D9', 3, 'minor', 'narrative', 'Kalıp ifade yok', 'Ekranda emoji ya da kalıp (slop) ifade yok mu?'),
  no_genai_look: dim(V, 'D9', 3, 'minor', 'visual', 'Üretken görsel izi yok', 'Görüntü tipik üretken yapay zekâ görünümü (aşırı pürüzsüz, anlamsız ayrıntı) taşımıyor mu?'),
  fresh_hook: dim(V, 'D9', 2, 'minor', 'narrative', 'Taze kanca', 'Kanca, verilen son kancalardan belirgin biçimde farklı mı?'),
  no_third_party: gate(V, 'G3', 'visual', 'Üçüncü taraf hakkı yok', 'Karelerde üçüncü tarafın marka, logo, karakter ya da telifli görseli var mı? (Yoksa geçer.)'),
  honest_cg: gate(V, 'G5', 'visual', 'CG dürüstçe sunuluyor', 'CG gerçek çekim gibi sunulmuyor ve taklit edilebilir tehlikeli bir eylem gösterilmiyor mu?'),
  claims_supported: dim(F, 'D4', 5, 'major', 'factual', 'İddialar destekli', 'Ekrandaki her iddia araştırmadaki alıntıyla örtüşüyor mu?'),
  info_density: dim(F, 'D4', 3, 'minor', 'factual', 'Bilgi yoğunluğu', 'Video, süresine göre yeterince somut bilgi taşıyor mu?'),
  mechanism_explained: dim(F, 'D4', 3, 'major', 'factual', 'Mekanizma anlatılıyor', 'Ürünün çalışma mekanizması izleyicinin anlayacağı biçimde anlatılıyor mu?'),
  engineer_insight: dim(F, 'D4', 2, 'minor', 'factual', 'Mühendislik içgörüsü', 'Videoda bir tasarım kararının nedenini açıklayan mühendislik içgörüsü var mı?'),
  storyboard_match: dim(F, 'D4', 2, 'minor', 'factual', 'Storyboard ile uyum', 'Final video storyboard\'daki vuruş sırası ve iddialarla uyumlu mu?'),
  claims_verified: gate(F, 'G2', 'factual', 'İddialar doğrulandı', 'Web hedeflerinin hiçbirinde ulaşılabilen bir kaynak iddiayı çürütmüyor ya da desteksiz bırakmıyor mu?'),
  hook_frame0: dim(R, 'D1', 5, 'blocker', 'visual', 'Kanca ilk karede', 'İlk karede izleyiciyi durduracak net bir görsel ya da yazı kancası var mı?'),
  hook_pattern: dim(R, 'D1', 4, 'major', 'narrative', 'Kanca kalıbı', 'Kanca beş kalıptan birini (soru, sayı, yanılgı, açılış, karşıtlık) belirgin biçimde kullanıyor mu?'),
  open_question: dim(R, 'D1', 3, 'minor', 'narrative', 'Açık soru', 'Kanca, ilk saniyelerde cevabı merak ettiren açık bir soru kuruyor mu?'),
  hook_text_short: dim(R, 'D1', 3, 'minor', 'narrative', 'Kanca yazısı kısa', 'Kanca yazısı kısa (yaklaşık sekiz sözcük ya da altı) ve tek bakışta okunur mu?'),
  loop_seam: dim(R, 'D8', 3, 'minor', 'visual', 'Döngü dikişi', 'qc SSIM ölçümüne göre son kare ilk kareye doğal biçimde bağlanıyor mu?'),
  rehook: dim(R, 'D8', 2, 'minor', 'narrative', 'Yeniden kanca', 'Orta noktada izleyiciyi yeniden yakalayan bir an (rehook) var mı?'),
  payoff: dim(R, 'D8', 3, 'major', 'narrative', 'Ödül anı', 'Kancanın vaat ettiği cevap videoda net bir ödül anıyla veriliyor mu?'),
};

export const checksOf = (role: FinalReviewerRole): FinalCheckId[] => FINAL_CHECK_IDS.filter((id) => FINAL_CHECKS[id].owner === role);

const unit = z.number().min(0).max(1);
const tr = (max: number) => z.string().trim().min(1).max(max);
const EvidenceSchema = z.object({
  /** Frame number of the final video (0-based). */
  frame: z.number().int().min(0),
  /** Seconds; must agree with frame / fps within 0.5 s (finalReviewRefErrors). */
  timecode: z.number().min(0),
  crop: z.object({ x: unit, y: unit, w: unit, h: unit }).optional(),
});
const FinalCheckResultSchema = z.object({
  id: z.enum(FINAL_CHECK_IDS),
  pass: z.boolean(),
  score: unit,
  evidence: EvidenceSchema.optional(),
  fix_hint: tr(300).optional(),
});
/** F10: one entry per web target the step handed to reviewer_facts. */
const WebCheckSchema = z.object({
  claim_id: tr(60),
  url: z.string().regex(/^https?:\/\/\S+$/, 'http(s) URL olmalı'),
  reachable: z.boolean(),
  supports: z.boolean(),
  note_tr: tr(200).optional(),
});
export type WebCheck = z.infer<typeof WebCheckSchema>;

const FinalReviewBase = z.object({
  rubric_version: z.literal(RUBRIC_VERSION),
  reviewer_role: z.enum(FINAL_REVIEWER_ROLES),
  checks: z.array(FinalCheckResultSchema).min(1).max(FINAL_CHECK_IDS.length),
  web_checks: z.array(WebCheckSchema).max(40).optional(),
  summary_tr: tr(400),
});
export type FinalReview = z.infer<typeof FinalReviewBase>;

export const FinalReviewSchema = FinalReviewBase.superRefine((r, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const seen = new Set<string>();
  r.checks.forEach((c, i) => {
    if (FINAL_CHECKS[c.id].owner !== r.reviewer_role) issue(['checks', i, 'id'], `bu rolün kontrolü değil: ${c.id}`);
    else if (seen.has(c.id)) issue(['checks', i, 'id'], `tekrarlanan kontrol: ${c.id}`);
    seen.add(c.id);
    if (c.pass !== c.score >= 0.5) issue(['checks', i, 'pass'], 'geçti ⇔ score ≥ 0,5');
    if (!c.pass && !c.evidence) issue(['checks', i, 'evidence'], 'başarısız kontrolde kanıt (kare ve zaman kodu) zorunlu');
    if (!c.pass && !c.fix_hint) issue(['checks', i, 'fix_hint'], 'başarısız kontrolde düzeltme ipucu zorunlu');
  });
  for (const id of checksOf(r.reviewer_role)) if (!seen.has(id)) issue(['checks'], `eksik kontrol: ${id}`);
  if (r.reviewer_role === 'reviewer_facts' && !r.web_checks) issue(['web_checks'], 'doğruluk reviewer\'ı için web_checks zorunlu');
});

/** F10: "unsupported" = a reachable source does not carry the claim and no reachable source supports it. An unreachable page alone never counts. */
function unsupportedClaims(web: WebCheck[]): string[] {
  const out: string[] = [];
  for (const claim of new Set(web.map((w) => w.claim_id))) {
    const reached = web.filter((w) => w.claim_id === claim && w.reachable);
    if (reached.length && !reached.some((w) => w.supports)) out.push(claim);
  }
  return out;
}

/** Cross-checks against the final that was actually reviewed and the web targets the step handed over (same-session fix requests). */
export function finalReviewRefErrors(r: FinalReview, o: { role: FinalReviewerRole; frames: number; fps: number; webTargets?: { claim_id: string; url: string }[] }): string[] {
  const out: string[] = [];
  if (r.reviewer_role !== o.role) out.push(`reviewer_role: ${o.role} bekleniyordu, ${r.reviewer_role} geldi`);
  r.checks.forEach((c, i) => {
    if (!c.evidence) return;
    if (c.evidence.frame >= o.frames) out.push(`checks.${i}.evidence.frame: finalde ${o.frames} kare var (0–${o.frames - 1})`);
    if (Math.abs(c.evidence.frame / o.fps - c.evidence.timecode) > 0.5) out.push(`checks.${i}.evidence.timecode: kare ${c.evidence.frame} ≈ ${(c.evidence.frame / o.fps).toFixed(2)} sn olmalı`);
  });
  if (o.role === 'reviewer_facts') {
    const web = r.web_checks ?? [];
    for (const t of o.webTargets ?? []) {
      if (!web.some((w) => w.claim_id === t.claim_id && w.url === t.url)) out.push(`web_checks: hedef kontrol edilmedi: ${t.claim_id} ${t.url}`);
    }
    const unsupported = unsupportedClaims(web);
    const verified = r.checks.findIndex((c) => c.id === 'claims_verified' && c.pass);
    if (unsupported.length && verified >= 0) out.push(`checks.${verified}.pass: desteksiz iddia varken claims_verified geçemez: ${unsupported.join(', ')}`);
  }
  return out;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Dimension = Σ(points × score) of the role's checks; gate = all of its checks passed; failed = the checks that did not (F4). */
export function scoreReview(r: FinalReview): { dimensions: Partial<Record<DimensionId, number>>; gates: Partial<Record<GateId, boolean>>; failed: FinalCheckId[] } {
  const dimensions: Partial<Record<DimensionId, number>> = {};
  const gates: Partial<Record<GateId, boolean>> = {};
  for (const c of r.checks) {
    const def = FINAL_CHECKS[c.id];
    if (def.dimension) dimensions[def.dimension] = (dimensions[def.dimension] ?? 0) + def.points * c.score;
    if (def.gate) gates[def.gate] = (gates[def.gate] ?? true) && c.pass;
  }
  for (const d of Object.keys(dimensions) as DimensionId[]) dimensions[d] = r2(dimensions[d]!);
  return { dimensions, gates, failed: FINAL_CHECK_IDS.filter((id) => r.checks.some((c) => c.id === id && !c.pass)) };
}

/** F7: two independent visual reviews merged. Scores are averaged per check; a gate check passes only if both passed (score = the lower one). */
export function averageVisual(a: FinalReview, b: FinalReview): FinalReview {
  const checks = a.checks.map((ca) => {
    const cb = b.checks.find((c) => c.id === ca.id) ?? ca;
    const isGate = FINAL_CHECKS[ca.id].gate !== null;
    const avg = r3((ca.score + cb.score) / 2);
    const pass = isGate ? ca.pass && cb.pass : avg >= 0.5;
    if (pass) return { id: ca.id, pass, score: avg };
    const failing = [ca, cb].filter((c) => !c.pass).sort((x, y) => x.score - y.score);
    const src = failing.find((c) => c.evidence && c.fix_hint) ?? failing[0] ?? ca;
    return { id: ca.id, pass, score: isGate ? Math.min(ca.score, cb.score) : avg, ...(src.evidence ? { evidence: src.evidence } : {}), ...(src.fix_hint ? { fix_hint: src.fix_hint } : {}) };
  });
  return { ...a, checks, summary_tr: `${a.summary_tr} / ${b.summary_tr}`.slice(0, 400) };
}

export interface PanelScore {
  /** null when the reviewers did not run (an AUTO gate failed, F6) or a role is missing. */
  total: number | null;
  dimensions: Record<DimensionId, number | null>;
  gates: Record<GateId, boolean | null>;
  /** Dimensions below DIMENSION_FLOOR of their weight. */
  low: DimensionId[];
  /** Gates that are known to have failed. */
  failedGates: GateId[];
  /** Failed LLM checks, then failed qc checks that carry points or a gate (ids). */
  failed: string[];
}

export function panelScore(i: { qc: QcReport; reviews: Partial<Record<FinalReviewerRole, FinalReview>> | null; g4: boolean }): PanelScore {
  const scored = FINAL_REVIEWER_ROLES.map((role) => (i.reviews?.[role] ? scoreReview(i.reviews[role]!) : null));
  const dimensions = Object.fromEntries(DIMENSION_IDS.map((d) => [d, null])) as Record<DimensionId, number | null>;
  dimensions.D6 = i.qc.scores.D6;
  dimensions.D7 = i.qc.scores.D7;
  for (const s of scored) if (s) for (const [d, v] of Object.entries(s.dimensions)) dimensions[d as DimensionId] = v;
  const checkOk = (id: FinalCheckId): boolean | null => {
    const c = i.reviews?.[FINAL_CHECKS[id].owner]?.checks.find((x) => x.id === id);
    return c ? c.pass : null;
  };
  const gates = Object.fromEntries(GATE_IDS.map((g) => [g, null])) as Record<GateId, boolean | null>;
  gates.G1 = i.qc.gates.G1;
  gates.G4 = i.g4;
  gates.G6 = i.qc.gates.G6;
  for (const s of scored) if (s) for (const [g, v] of Object.entries(s.gates)) gates[g as GateId] = v;
  // G5 = the qc flash count AND the visual reviewer's "CG presented as real".
  const honest = checkOk('honest_cg');
  gates.G5 = !i.qc.gates.G5 ? false : honest;
  const all = DIMENSION_IDS.map((d) => dimensions[d]);
  const total = all.every((v) => v !== null) ? r2(all.reduce((a, v) => a + v!, 0)) : null;
  const low = DIMENSION_IDS.filter((d) => dimensions[d] !== null && dimensions[d]! < r2(DIMENSIONS[d].weight * DIMENSION_FLOOR));
  const failedGates = GATE_IDS.filter((g) => gates[g] === false);
  const llm = scored.flatMap((s) => s?.failed ?? []);
  const qcFailed: string[] = [];
  for (const c of [...i.qc.music, ...i.qc.tiktok]) {
    const def = QC_CHECKS[c.id];
    if (!c.pass && (def.gate || def.points > 0) && !qcFailed.includes(c.id)) qcFailed.push(c.id);
  }
  return { total, dimensions, gates, low, failedGates, failed: [...llm, ...qcFailed] };
}

/** Spec K13, deterministic: six gates + total ≥ 80 + every dimension ≥ 60 % → ready; total < 70 → rework; otherwise fix. An unknown total or gate never reads as ready. */
export function finalVerdict(s: PanelScore): 'ready' | 'fix' | 'rework' {
  if (s.total === null) return 'fix';
  if (GATE_IDS.every((g) => s.gates[g] === true) && s.total >= READY_SCORE && s.low.length === 0) return 'ready';
  return s.total < REWORK_BELOW ? 'rework' : 'fix';
}

/** Spec §8.3: gates passed and the total within 78–82 earns one second, independent visual review. */
export function isBorderline(s: Pick<PanelScore, 'total' | 'failedGates'>): boolean {
  return s.total !== null && s.failedGates.length === 0 && s.total >= BORDERLINE[0] && s.total <= BORDERLINE[1];
}

/** One decimal with a comma ("87,5"), everywhere a score is shown (F16). */
export function formatScore(n: number): string {
  return (Math.round(Math.round(n * 100) / 10) / 10).toFixed(1).replace('.', ',');
}
