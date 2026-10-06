import { z } from 'zod';
import type { Storyboard } from './artifacts.ts';
import { CHANNEL_STYLE_IDS, type ChannelStyleId } from './styles.ts';

/** vg_blender building blocks (python/vg_blender/vg_blender/primitives.py). Descriptive: product.py is the geometry source. */
export const PRIMITIVES = ['lathe', 'box', 'cylinder', 'sphere', 'tube', 'spring', 'gear', 'screw', 'extrude', 'pcb', 'wire', 'mesh'] as const;
export type Primitive = (typeof PRIMITIVES)[number];
/** vg_blender/materials.py presets (spec §7.3: wear, roughness, bump, brushed metal; brass, chrome, ABS, clear PC). */
export const MATERIAL_PRESETS = ['brass', 'chrome', 'steel', 'aluminum', 'copper', 'abs_matte', 'abs_gloss', 'pc_clear', 'rubber', 'pcb_green', 'ink', 'paper', 'ceramic'] as const;
export type MaterialPreset = (typeof MATERIAL_PRESETS)[number];
export const EASES = ['linear', 'ease_in', 'ease_out', 'ease_in_out', 'back_out'] as const;
export type Ease = (typeof EASES)[number];
export const LIGHTING_PRESETS = ['key_rim_warm', 'key_rim_cool', 'soft_box'] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];
/** Spec §7.4 events.json. */
export const SCENE_EVENT_TYPES = ['explode_start', 'part_lock', 'label_in', 'zoom'] as const;

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'küçük harf, rakam, - veya _ (en çok 40)');
const tr = (max: number) => z.string().trim().min(1).max(max);
/** Centimetres (1 Blender unit = 1 cm). A fixed-length array, not a tuple (no prefixItems for the CLI). */
const vec3 = z.array(z.number().min(-2000).max(2000)).length(3);
const EPS = 0.05;

const ScenePartSchema = z.object({
  id: slug,
  name_tr: tr(40),
  recipe: z.object({ primitive: z.enum(PRIMITIVES), note: tr(200) }),
  /** Reserved for CC0 assets (spec §7.3 order 2–5). M4b rejects it: the asset ledger and license gate arrive in M5. */
  asset_ref: z.string().max(120).optional(),
  material_preset: z.enum(MATERIAL_PRESETS),
  /** The part moves by `vector` (cm, Blender Z-up) between t_start and t_end (s), then stays. */
  explode: z.object({ vector: vec3, t_start: z.number().min(0), t_end: z.number().positive(), ease: z.enum(EASES) }),
  /** Label anchor in the part's local frame (cm). */
  anchor_local: vec3,
});
const CameraKeySchema = z.object({
  t: z.number().min(0),
  position: vec3,
  target: vec3,
  lens_mm: z.number().min(50).max(135),
  /** Easing of the segment that starts at this key. */
  ease: z.enum(EASES),
});

const SceneBase = z.object({
  units: z.literal('cm'),
  fps: z.literal(30),
  duration_s: z.number().min(35).max(55),
  /** round(duration_s × 30); frame 0 … frames is the closed range Blender keys and Remotion plays. */
  frames: z.number().int().min(1050).max(1650),
  style_id: z.enum(CHANNEL_STYLE_IDS),
  lighting_preset: z.enum(LIGHTING_PRESETS),
  /** The hero object of frame 0 (spec §7.3: ≥ 35 % of the frame height). */
  hero_part: slug,
  parts: z.array(ScenePartSchema).min(2).max(40),
  camera_keys: z.array(CameraKeySchema).min(2).max(40),
});
export type SceneSpec = z.infer<typeof SceneBase>;

const firstDuplicate = (ids: string[]) => ids.find((id, i) => ids.indexOf(id) !== i);

export const SceneSpecSchema = SceneBase.superRefine((s, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (s.frames !== Math.round(s.duration_s * s.fps)) issue(['frames'], `frames round(duration_s × 30) = ${Math.round(s.duration_s * s.fps)} olmalı`);
  const dup = firstDuplicate(s.parts.map((p) => p.id));
  if (dup) issue(['parts'], `tekrarlanan parça kimliği: ${dup}`);
  if (!s.parts.some((p) => p.id === s.hero_part)) issue(['hero_part'], `hero_part parçalarda yok: ${s.hero_part}`);
  s.parts.forEach((p, i) => {
    if (p.explode.t_end <= p.explode.t_start) issue(['parts', i, 'explode', 't_end'], "t_end, t_start'tan büyük olmalı");
    if (p.explode.t_end > s.duration_s + EPS) issue(['parts', i, 'explode', 't_end'], `t_end sürenin (${s.duration_s} sn) içinde olmalı`);
    if (p.asset_ref !== undefined) issue(['parts', i, 'asset_ref'], 'hazır varlık (asset_ref) varlık defteri ve lisans kapısı gelene kadar (M5) kullanılamaz; parçayı vg_blender ile kur');
  });
  const keys = s.camera_keys;
  if (Math.abs(keys[0]!.t) > EPS) issue(['camera_keys', 0, 't'], "kamera anahtarları 0 sn'de başlamalı");
  if (Math.abs(keys.at(-1)!.t - s.duration_s) > EPS) issue(['camera_keys'], `kamera anahtarları duration_s (${s.duration_s}) anında bitmeli`);
  keys.forEach((k, i) => {
    if (i > 0 && k.t <= keys[i - 1]!.t) issue(['camera_keys', i, 't'], 'kamera anahtarları zamanda kesin artan olmalı');
    if (k.position.every((v, j) => Math.abs(v - k.target[j]!) < 1e-6)) issue(['camera_keys', i, 'target'], 'kamera konumu ile hedef aynı olamaz');
  });
});

/** Cross-artifact rules (same-session fix requests, like storyboardRefErrors). */
export function sceneRefErrors(scene: SceneSpec, storyboard: Storyboard, styleId: ChannelStyleId): string[] {
  const out: string[] = [];
  if (Math.abs(scene.duration_s - storyboard.duration_s) > EPS) out.push(`duration_s storyboard ile aynı olmalı (${storyboard.duration_s})`);
  const ids = new Set(scene.parts.map((p) => p.id));
  const named = new Set(storyboard.beats.flatMap((b) => b.parts));
  for (const p of named) if (!ids.has(p)) out.push(`storyboard'daki parça sahnede yok: ${p}`);
  const first = storyboard.beats[0]?.parts ?? [];
  if (first.length && !first.includes(scene.hero_part)) out.push(`hero_part ilk vuruşun parçalarından biri olmalı (${first.join(', ')})`);
  if (scene.style_id !== styleId) out.push(`style_id kanal kimliği "${styleId}" olmalı`);
  return out;
}

/** Spec §7.3: five frames of the anchor equivalence check (first, quarters, last). */
export function EQUIVALENCE_FRAMES(frames: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((q) => Math.floor(q * frames));
}

/** Blender portrait frame, sensor_fit AUTO: the sensor spans the longer (vertical) side → yfov = 2·atan(sensor/2 ÷ lens). */
export function yfovFromLens(lensMm: number, sensorMm = 36): number {
  return 2 * Math.atan(sensorMm / 2 / lensMm);
}

const px2 = z.array(z.number()).length(2);
/** Written by vg_blender: screen positions (px, top-left origin) of every part anchor on every `step`-th frame and the equivalence frames. */
export const SceneAnchorsSchema = z.object({
  width: z.literal(1080),
  height: z.literal(1920),
  fps: z.literal(30),
  step: z.number().int().min(1),
  frames: z.record(z.string().regex(/^\d+$/), z.record(slug, px2)),
});
export type SceneAnchors = z.infer<typeof SceneAnchorsSchema>;

export const SceneEventsSchema = z.object({
  events: z.array(z.object({ id: z.string().min(1).max(80), type: z.enum(SCENE_EVENT_TYPES), frame: z.number().int().min(0), part_id: slug.optional() })),
});
export type SceneEvents = z.infer<typeof SceneEventsSchema>;

/** glTF does not animate the camera lens: Blender writes the vertical FOV (radians) of every frame 0…frames. */
export const CameraTrackSchema = z.object({ fps: z.literal(30), sensor_mm: z.number().positive(), yfov: z.array(z.number().positive()).min(2) });
export type CameraTrack = z.infer<typeof CameraTrackSchema>;

/** vg_blender build report (build.json). Hard failures stop the build; the rest is input for the builder and the draft reviewer. */
export const BuildReportSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
  parts: z.array(slug),
  missing_parts: z.array(slug),
  extra_parts: z.array(z.string()),
  overlaps: z.array(z.object({ a: z.string(), b: z.string() })),
  hero_ratio: z.number().min(0),
  occlusion: z.array(z.object({ beat_id: z.string(), part_id: z.string(), ratio: z.number() })),
  triangles: z.number().int().min(0),
  frames: z.number().int().min(0),
  warnings: z.array(z.string()),
});
export type BuildReport = z.infer<typeof BuildReportSchema>;
