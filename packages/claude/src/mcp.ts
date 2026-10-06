import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolResult, VgTool } from './driver.ts';
import { IMPLEMENTED_MCP, SPEC_KINDS, type RoleDef, type SpecKind } from './roles.ts';
import type { SpecStore } from './spec-store.ts';

/** build_scene result for the agent (plan B10): paths relative to the run directory, no host paths or raw stderr. */
export interface BuildToolResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  report: { parts: string[]; missing_parts: string[]; hero_ratio: number; occlusion: unknown[]; overlaps: unknown[]; triangles: number } | null;
  equivalence: { worst_px: number; pass: boolean } | null;
  files: Record<string, string> | null;
}
export interface StillsToolResult { contact_sheet: string; stills: string[]; renderer: string }

export interface McpPorts {
  /** Clamps into [last, 99] and persists; returns the stored value. */
  reportProgress(percent: number, message: string): Promise<number>;
  registerArtifact(absPath: string, kind: string): Promise<{ sha256: string; bytes: number; mime: string }>;
  context(): Record<string, unknown>;
  /** M4b, build sessions only (the worker supplies them): spec §6.3 build_scene / render_preview_stills. */
  buildScene?(): Promise<BuildToolResult>;
  previewStills?(o: { frames?: number[] }): Promise<StillsToolResult>;
}

const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });
const json = (v: unknown): ToolResult => ok(JSON.stringify(v));

function insideRun(runDir: string, p: string): string | null {
  const abs = resolve(runDir, p);
  if (!existsSync(abs)) return null;
  const real = realpathSync(abs);
  const r = relative(realpathSync(runDir), real);
  return r && !r.startsWith('..') && !isAbsolute(r) ? abs : null;
}

/** In-process videogen MCP tools for one session (spec §6.3). Only implemented tools the role owns are exposed. */
export function videogenTools(o: { role: RoleDef; runDir: string; ports: McpPorts; specs: SpecStore }): VgTool[] {
  const kind = z.enum(SPEC_KINDS);
  const all: VgTool[] = [
    {
      name: 'report_progress',
      description: 'Report a progress milestone of your task: percent 0-100 and a short Turkish message. Values only move forward.',
      shape: { percent: z.number().min(0).max(100), message: z.string().max(200) },
      handler: async (a) => ok(`ok: ${await o.ports.reportProgress(a.percent as number, a.message as string)}`),
    },
    {
      name: 'get_context',
      description: 'Ids and paths of this session: session, role, run directory and (when present) run, video, version and thread.',
      shape: {},
      handler: async () => json(o.ports.context()),
    },
    {
      name: 'read_spec',
      description: 'Read a versioned spec (research, storyboard, scene, audio): the latest version or a given one.',
      shape: { kind, version: z.number().int().positive().optional() },
      handler: async (a) => {
        const r = await o.specs.read(a.kind as SpecKind, a.version as number | undefined);
        return r ? json(r) : fail(`no ${String(a.kind)} spec${a.version ? ` version ${String(a.version)}` : ''} yet`);
      },
    },
    {
      name: 'write_spec',
      description: 'Validate and save a new version of a spec; returns the version number and the changed JSON paths.',
      shape: { kind, content: z.record(z.string(), z.unknown()) },
      handler: async (a) => {
        if (!o.role.specWrite.includes(a.kind as SpecKind)) return fail(`the ${o.role.role} role cannot write the ${String(a.kind)} spec`);
        const r = await o.specs.write(a.kind as SpecKind, a.content);
        return 'errors' in r ? fail(`invalid ${String(a.kind)} spec: ${r.errors.join('; ')}`) : json(r);
      },
    },
    {
      name: 'build_scene',
      description: 'Build the 3D scene headless (no render, CPU, seconds): runs scene/product.py in a sandbox, then keys the explode and the camera from the latest scene spec (write_spec scene first), lights it with the channel style and exports GLB + anchors. Returns errors (with product.py line numbers), warnings (hero size, occlusion, intersections), the Blender/three.js anchor check (must be ≤ 8 px) and the files.',
      shape: {},
      handler: async () => {
        const r = await o.ports.buildScene!();
        return { ...json(r), ...(r.ok ? {} : { isError: true }) };
      },
    },
    {
      name: 'render_preview_stills',
      description: 'Render up to 8 EEVEE preview stills (50 % scale, 16 samples) of the last successful build_scene and a 4×2 contact sheet with the TikTok safe area tinted red. Default frames: 0 and the beat midpoints. Read the contact sheet image to check framing. GPU: may wait for the GPU queue.',
      shape: { frames: z.array(z.number().int().min(0)).max(8).optional() },
      handler: async (a) => {
        try {
          return json(await o.ports.previewStills!({ frames: a.frames as number[] | undefined }));
        } catch (e) {
          return fail((e as Error).message);
        }
      },
    },
    {
      name: 'register_artifact',
      description: 'Store a file from the run directory in the content-addressed media store; returns its sha256.',
      shape: { path: z.string(), kind: z.string().max(64) },
      handler: async (a) => {
        const abs = insideRun(o.runDir, a.path as string);
        if (!abs) return fail('path must be an existing file inside the run directory');
        return json(await o.ports.registerArtifact(abs, a.kind as string));
      },
    },
  ];
  const owned = new Set(o.role.mcp.filter((n) => (IMPLEMENTED_MCP as readonly string[]).includes(n)));
  // Scene tools exist only where the worker supplied their ports (a build step), never in chat or other sessions.
  const supplied = (n: string) => (n === 'build_scene' ? !!o.ports.buildScene : n === 'render_preview_stills' ? !!o.ports.previewStills : true);
  return all.filter((t) => owned.has(t.name) && supplied(t.name));
}
