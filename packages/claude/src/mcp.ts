import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ToolResult, VgTool } from './driver.ts';
import { IMPLEMENTED_MCP, SPEC_KINDS, type RoleDef, type SpecKind } from './roles.ts';
import type { SpecStore } from './spec-store.ts';

export interface McpPorts {
  /** Clamps into [last, 99] and persists; returns the stored value. */
  reportProgress(percent: number, message: string): Promise<number>;
  registerArtifact(absPath: string, kind: string): Promise<{ sha256: string; bytes: number; mime: string }>;
  context(): Record<string, unknown>;
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
  return all.filter((t) => owned.has(t.name));
}
