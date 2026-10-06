import { z } from 'zod';
import { SceneSpecSchema, type SceneSpec } from './scene.ts';

/** Spec §8.1 D1: the hook uses one of five patterns. Names are derived (the spec lists none); M5 calibration may revise them. */
export const HOOK_PATTERNS = ['question', 'number', 'misconception', 'reveal', 'contrast'] as const;
export type HookPattern = (typeof HOOK_PATTERNS)[number];
export const HOOK_PATTERN_LABELS: Record<HookPattern, string> = {
  question: 'Merak sorusu',
  number: 'Şaşırtıcı sayı',
  misconception: 'Yaygın yanılgı',
  reveal: 'Görsel açılış',
  contrast: 'Dışı/içi karşıtlığı',
};

export const AUDIO_MODES = ['vo', 'silent'] as const;
export type AudioMode = (typeof AUDIO_MODES)[number];

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'küçük harf, rakam, - veya _ (en çok 40)');
const tr = (max: number) => z.string().trim().min(1).max(max);
const url = z.string().regex(/^https?:\/\/\S+$/, 'http(s) URL olmalı');

const SourceSchema = z.object({
  url,
  quote: tr(500),
  accessed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'YYYY-MM-DD'),
  type: z.enum(['primary', 'independent']),
});
const PartSchema = z.object({
  id: slug,
  name_tr: tr(60),
  function: tr(300),
  material: tr(80),
  /** Length, width, height in mm. A fixed-length array (minItems/maxItems), not a tuple: no prefixItems for the CLI. */
  approx_dims_mm: z.array(z.number().positive()).length(3),
  count: z.number().int().min(1).max(500),
  assembly_order: z.number().int().min(1),
  sources: z.array(url).max(10),
});
const ClaimSchema = z.object({ id: slug, text_tr: tr(300), sources: z.array(SourceSchema).min(1).max(6) });

const ResearchBase = z.object({
  interpretation: tr(200),
  difficulty: z.enum(['procedural', 'needs_asset', 'too_hard']),
  difficulty_reason_tr: tr(400).optional(),
  parts: z.array(PartSchema).max(40),
  mechanism: z.object({ summary_tr: tr(600), steps: z.array(tr(300)).min(1).max(12) }),
  claims: z.array(ClaimSchema).max(40),
  fun_facts: z.array(tr(300)).max(10),
  engineer_insight: tr(600),
});
export type ProductResearch = z.infer<typeof ResearchBase>;

const firstDuplicate = (ids: string[]): string | undefined => ids.find((id, i) => ids.indexOf(id) !== i);

export const ProductResearchSchema = ResearchBase.superRefine((r, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const p = firstDuplicate(r.parts.map((x) => x.id));
  if (p) issue(['parts'], `tekrarlanan parça kimliği: ${p}`);
  const c = firstDuplicate(r.claims.map((x) => x.id));
  if (c) issue(['claims'], `tekrarlanan iddia kimliği: ${c}`);
  if (r.difficulty === 'too_hard') {
    if (!r.difficulty_reason_tr) issue(['difficulty_reason_tr'], 'too_hard için gerekçe zorunlu');
    return;
  }
  if (r.parts.length < 3) issue(['parts'], 'en az 3 parça gerekli');
  if (r.claims.length < 3) issue(['claims'], 'en az 3 kaynaklı iddia gerekli');
});

/** Soft rules (G2 is a review gate in M5): a numeric claim needs 2 independent sources or 1 primary source. */
export function researchWarnings(r: ProductResearch): string[] {
  const out: string[] = [];
  for (const c of r.claims) {
    if (!/\d/.test(c.text_tr)) continue;
    const primary = c.sources.some((s) => s.type === 'primary');
    const independent = new Set(c.sources.filter((s) => s.type === 'independent').map((s) => new URL(s.url).hostname)).size;
    if (!primary && independent < 2) out.push(`${c.id}: sayısal iddia için 2 bağımsız ya da 1 birincil kaynak gerekir`);
  }
  return out;
}

const BeatSchema = z.object({
  id: slug,
  t_start: z.number().min(0),
  t_end: z.number().positive(),
  camera: z.object({
    shot: z.enum(['hero', 'wide', 'medium', 'close', 'macro']),
    move: z.enum(['static', 'orbit', 'push_in', 'pull_out', 'pan', 'tilt']),
    lens_mm: z.number().min(50).max(135),
  }),
  parts: z.array(slug).max(12),
  action: tr(300),
  onscreen_text: z.object({ tr: tr(60) }),
  vo_text: z.object({ tr: tr(300) }).optional(),
  sfx_cues: z.array(tr(40)).max(4),
  claim_ids: z.array(slug).max(6),
});
export type Beat = z.infer<typeof BeatSchema>;

const StoryboardBase = z.object({
  version: z.number().int().min(1),
  audio_mode: z.enum(AUDIO_MODES),
  duration_s: z.number().min(35).max(55),
  hook: z.object({ pattern: z.enum(HOOK_PATTERNS), text_tr: tr(60) }),
  beats: z.array(BeatSchema).min(4).max(24),
  rehook_at: z.number().positive(),
  payoff_at: z.number().positive(),
  loop_strategy: tr(200),
  cta: z.object({ tr: tr(80) }).optional(),
});
export type Storyboard = z.infer<typeof StoryboardBase>;

const EPS = 0.05;

export const StoryboardSchema = StoryboardBase.superRefine((s, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const dup = firstDuplicate(s.beats.map((b) => b.id));
  if (dup) issue(['beats'], `tekrarlanan vuruş kimliği: ${dup}`);
  if (s.beats[0] && Math.abs(s.beats[0].t_start) > EPS) issue(['beats', 0, 't_start'], "ilk vuruş 0 sn'de başlamalı");
  s.beats.forEach((b, i) => {
    if (b.t_end <= b.t_start) issue(['beats', i, 't_end'], "t_end, t_start'tan büyük olmalı");
    const prev = s.beats[i - 1];
    if (prev && Math.abs(b.t_start - prev.t_end) > EPS) issue(['beats', i, 't_start'], `vuruşlar bitişik olmalı (önceki ${prev.t_end} sn'de bitiyor)`);
    if (s.audio_mode === 'vo' && !b.vo_text) issue(['beats', i, 'vo_text'], "seslendirmeli modda her vuruşun vo_text'i olmalı");
    if (s.audio_mode === 'silent' && b.vo_text) issue(['beats', i, 'vo_text'], 'seslendirmesiz modda vo_text olmaz');
  });
  const last = s.beats.at(-1);
  if (last && Math.abs(last.t_end - s.duration_s) > EPS) issue(['beats'], `son vuruş duration_s (${s.duration_s}) anında bitmeli`);
  if (s.rehook_at < 0.4 * s.duration_s || s.rehook_at > 0.6 * s.duration_s) issue(['rehook_at'], "ikinci kanca sürenin %40–60'ında olmalı");
  if (s.payoff_at < 0.7 * s.duration_s || s.payoff_at > s.duration_s) issue(['payoff_at'], "ödül sürenin %70'inden sonra olmalı");
});

/** Cross-artifact rules: every part and claim a beat names exists in the research. */
export function storyboardRefErrors(s: Storyboard, r: ProductResearch): string[] {
  const parts = new Set(r.parts.map((p) => p.id));
  const claims = new Set(r.claims.map((c) => c.id));
  const out: string[] = [];
  s.beats.forEach((b, i) => {
    for (const p of b.parts) if (!parts.has(p)) out.push(`beats.${i}.parts: araştırmada olmayan parça: ${p}`);
    for (const c of b.claim_ids) if (!claims.has(c)) out.push(`beats.${i}.claim_ids: araştırmada olmayan iddia: ${c}`);
  });
  return out;
}

export const ARTIFACT_SCHEMAS = { ProductResearch: ProductResearchSchema, Storyboard: StoryboardSchema, SceneSpec: SceneSpecSchema } as const;
export type ArtifactSchemaName = keyof typeof ARTIFACT_SCHEMAS;
export interface ArtifactValues { ProductResearch: ProductResearch; Storyboard: Storyboard; SceneSpec: SceneSpec }
export type ArtifactValue<N extends ArtifactSchemaName> = ArtifactValues[N];

/** JSON Schema for the SDK's outputFormat. Refinements are not expressible there; validateArtifact re-checks them. */
export function outputJsonSchema(name: ArtifactSchemaName): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(ARTIFACT_SCHEMAS[name]) as Record<string, unknown>;
  return schema;
}

export function validateArtifact<N extends ArtifactSchemaName>(name: N, value: unknown): { ok: true; value: ArtifactValue<N> } | { ok: false; errors: string[] } {
  const r = ARTIFACT_SCHEMAS[name].safeParse(value);
  if (r.success) return { ok: true, value: r.data as ArtifactValue<N> };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '$'}: ${i.message}`) };
}
