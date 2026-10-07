import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type pg from 'pg';
import {
  CHANNEL_STYLES, EQUIVALENCE_FRAMES, sceneRefErrors, validateArtifact,
  type BuildReport, type ChannelStyleId, type SceneSpec, type Storyboard,
} from '@videogen/shared';
import { getChannelStyle } from '@videogen/db';
import { SpecStore, type BuildToolResult, type StillsToolResult } from '@videogen/claude';
import { checkEquivalence, parseGlb } from '@videogen/scene3d';
import type { ToolHost } from '../agents/manager.ts';
import { contactSheet } from '../render/ffmpeg.ts';
import { withResource, type WaitInfo } from '../render/gate.ts';
import type { ResourceLocks } from '../render/locks.ts';
import { RenderError, type BuildFiles, type Capability, type RenderDriver } from '../render/driver.ts';
import type { Probe } from './resources.ts';
import { ARTIFACT_VALIDATOR } from './validator.ts';

export interface SceneDeps {
  pool: pg.Pool;
  render: RenderDriver;
  locks: ResourceLocks;
  ffmpeg: string;
  capability: () => Capability;
  probe?: Probe;
  waitMs?: number;
  /** Delivery encode preset (spec §7.5 slow; smoke ultrafast). */
  encodePreset?: string;
}
export interface SceneBuild {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Not the agent's fault (no sandbox, no Blender): retrying the agent will not help. */
  unavailable: boolean;
  report: BuildReport | null;
  equivalence: { worst_px: number; pass: boolean } | null;
  files: BuildFiles | null;
  dir: string | null;
  scene: SceneSpec | null;
  specVersion: number | null;
  styleId: ChannelStyleId;
}
interface Ctx { runDir: string; owner: string; signal?: AbortSignal; onWait?: (w: WaitInfo) => void; onRun?: () => void }

const v4 = (n: number) => `v${String(n).padStart(4, '0')}.json`;

/** Spec §7.3: latest scene spec + scene/product.py → sandboxed two-phase build → three.js anchor equivalence (≤ 8 px). */
export async function buildScene(d: SceneDeps, o: Ctx): Promise<SceneBuild> {
  const style = await getChannelStyle(d.pool);
  const out: SceneBuild = { ok: false, errors: [], warnings: [], unavailable: false, report: null, equivalence: null, files: null, dir: null, scene: null, specVersion: null, styleId: style.id };
  const cap = d.capability();
  if (!cap.ok) return { ...out, unavailable: true, errors: [`render kullanılamıyor: ${cap.reason}`] };
  const specs = new SpecStore(join(o.runDir, 'spec'), ARTIFACT_VALIDATOR);
  const sceneRec = await specs.read('scene');
  const boardRec = await specs.read('storyboard');
  if (!sceneRec) return { ...out, errors: ["Sahne spec'i yok: önce write_spec ile kind \"scene\" yaz."] };
  const scene = validateArtifact('SceneSpec', sceneRec.value);
  const board = boardRec ? validateArtifact('Storyboard', boardRec.value) : null;
  if (!scene.ok) return { ...out, errors: scene.errors };
  if (!board?.ok) return { ...out, unavailable: true, errors: ['storyboard spec\'i okunamadı'] };
  out.scene = scene.value;
  out.specVersion = sceneRec.version;
  const refs = sceneRefErrors(scene.value, board.value, style.id);
  if (refs.length) return { ...out, errors: refs };
  const productPath = join(o.runDir, 'scene', 'product.py');
  if (!existsSync(productPath)) return { ...out, errors: ['scene/product.py yok: önce geometriyi yaz.'] };
  const dir = join(o.runDir, 'scene', 'builds', `b${Date.now()}`);
  try {
    const b = await withResource(d.locks, 'heavy_cpu', { owner: o.owner, signal: o.signal, probe: d.probe, extraDiskMb: 200, waitMs: d.waitMs, onWait: o.onWait, onRun: o.onRun }, () => d.render.build({
      runDir: o.runDir, specPath: join(o.runDir, 'spec', 'scene', v4(sceneRec.version)), storyboardPath: join(o.runDir, 'spec', 'storyboard', v4(boardRec!.version)),
      productPath, outDir: dir, style: CHANNEL_STYLES[style.id], owner: o.owner, signal: o.signal,
    }));
    out.report = b.report;
    out.warnings = b.report.warnings;
    out.dir = dir;
    if (!b.report.ok || !b.files) return { ...out, errors: b.report.errors };
    const json = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
    const eq = checkEquivalence(await parseGlb(await readFile(b.files.glb)), await json(b.files.anchors), await json(b.files.cameraTrack), EQUIVALENCE_FRAMES(scene.value.frames));
    out.equivalence = { worst_px: eq.worstPx, pass: eq.pass };
    if (!eq.pass) {
      const worst = eq.rows.filter((r) => r.px > 8).slice(0, 5).map((r) => `${r.partId}@${r.frame}: ${r.px} px`);
      return { ...out, errors: [`Blender↔three.js anchor eşdeğerliği geçmedi (en kötü ${eq.worstPx} px > 8 px; eksik: ${eq.missing.join(', ') || '—'}; ${worst.join(', ')})`] };
    }
    await writeFile(join(o.runDir, 'scene', 'builds', 'latest.json'), JSON.stringify({ dir, files: b.files, specVersion: sceneRec.version }));
    return { ...out, ok: true, files: b.files };
  } catch (e) {
    if (e instanceof RenderError && e.kind !== 'aborted') return { ...out, unavailable: e.kind === 'unavailable', errors: [e.message] };
    throw e;
  }
}

/** Spec §7.5: frame 0 (the hook and the hero) and the midpoint of every beat, at most `max`, spread evenly. */
export function previewFrames(storyboard: Storyboard, frames: number, max = 8): number[] {
  const all = [...new Set([0, ...storyboard.beats.map((b) => Math.round(((b.t_start + b.t_end) / 2) * 30))])].filter((f) => f <= frames).sort((a, b) => a - b);
  if (all.length <= max) return all;
  return Array.from({ length: max }, (_, i) => all[Math.round((i * (all.length - 1)) / (max - 1))]!);
}

export interface ScenePreview { dir: string; sheet: string; stills: string[]; renderer: string }

/** Preview stills of the last successful build_scene + the contact sheet with the safe-area overlay. GPU (spec §6.4 pre-check). */
export async function previewScene(d: SceneDeps, o: Ctx & { frames?: number[] }): Promise<ScenePreview> {
  const latestPath = join(o.runDir, 'scene', 'builds', 'latest.json');
  if (!existsSync(latestPath)) throw new Error('Önce build_scene ile başarılı bir build al.');
  const latest = JSON.parse(await readFile(latestPath, 'utf8')) as { dir: string; files: BuildFiles };
  const specs = new SpecStore(join(o.runDir, 'spec'), ARTIFACT_VALIDATOR);
  const board = validateArtifact('Storyboard', (await specs.read('storyboard'))?.value);
  const scene = validateArtifact('SceneSpec', (await specs.read('scene'))?.value);
  if (!board.ok || !scene.ok) throw new Error('storyboard ya da sahne spec\'i okunamadı');
  const frames = (o.frames?.length ? [...new Set(o.frames)] : previewFrames(board.value, scene.value.frames)).filter((f) => f <= scene.value.frames).slice(0, 8);
  const stillsDir = join(latest.dir, `stills-${Date.now()}`);
  await mkdir(stillsDir, { recursive: true });
  const r = await withResource(d.locks, 'gpu', { owner: o.owner, signal: o.signal, probe: d.probe, extraDiskMb: 200, waitMs: d.waitMs, onWait: o.onWait, onRun: o.onRun }, () =>
    d.render.stills({ runDir: o.runDir, blendPath: latest.files.blend, frames, outDir: stillsDir, owner: o.owner, signal: o.signal }));
  const sheet = join(stillsDir, 'preview.png');
  const style = CHANNEL_STYLES[scene.value.style_id];
  await contactSheet(d.ffmpeg, stillsDir, sheet, { background: style.background, size: { width: 540, height: 960 }, signal: o.signal });
  return { dir: stillsDir, sheet, stills: r.files, renderer: r.renderer };
}

export function toToolResult(runDir: string, b: SceneBuild): BuildToolResult {
  const rel = (p: string) => relative(runDir, p);
  return {
    ok: b.ok, errors: b.errors, warnings: b.warnings,
    report: b.report ? { parts: b.report.parts, missing_parts: b.report.missing_parts, hero_ratio: b.report.hero_ratio, occlusion: b.report.occlusion, overlaps: b.report.overlaps, triangles: b.report.triangles } : null,
    equivalence: b.equivalence,
    files: b.files ? Object.fromEntries(Object.entries(b.files).map(([k, v]) => [k, rel(v)])) : null,
  };
}

/** MCP ports for build sessions (spec §6.3). Only the builder of a run gets them; GPU waits show on the agent card (plan B8). */
export function sceneToolHost(d: SceneDeps): ToolHost {
  return {
    ports(s) {
      if (s.role !== 'builder' || !s.runId) return {};
      return {
        buildScene: async (): Promise<BuildToolResult> => {
          try {
            return toToolResult(s.runDir, await buildScene(d, { runDir: s.runDir, owner: s.sessionId, signal: s.signal }));
          } catch (e) {
            return { ok: false, errors: [(e as Error).name === 'AbortError' || s.signal.aborted ? 'durduruldu' : (e as Error).message], warnings: [], report: null, equivalence: null, files: null };
          }
        },
        previewStills: async ({ frames }): Promise<StillsToolResult> => {
          const p = await previewScene(d, {
            runDir: s.runDir, owner: s.sessionId, signal: s.signal, frames,
            onWait: (w) => s.gpuWait(w), onRun: () => s.gpuWait(null),
          });
          return { contact_sheet: relative(s.runDir, p.sheet), stills: p.stills.map((f) => relative(s.runDir, f)), renderer: p.renderer };
        },
      };
    },
  };
}
