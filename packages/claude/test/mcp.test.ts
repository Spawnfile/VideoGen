import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { diffJson, ROLES, SpecStore, videogenTools, zodValidator, type McpPorts, type VgTool } from '../src/index.ts';

const ports = (): McpPorts & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    reportProgress: vi.fn(async (p: number, m: string) => { calls.push(['progress', p, m]); return Math.min(99, p); }),
    registerArtifact: vi.fn(async (p: string, k: string) => { calls.push(['artifact', p, k]); return { sha256: 'f'.repeat(64), bytes: 1, mime: 'text/plain' }; }),
    context: () => ({ sessionId: 's1', role: 'builder' }),
  };
};
const run = () => {
  const dir = mkdtempSync(join(tmpdir(), 'vg-mcp-'));
  mkdirSync(join(dir, 'scene'));
  return dir;
};
const call = (tools: VgTool[], name: string, args: Record<string, unknown>) => tools.find((t) => t.name === name)!.handler(args);
const text = (r: Awaited<ReturnType<VgTool['handler']>>) => r.content[0]!.text;

describe('videogen MCP tools', () => {
  it('exposes only implemented tools the role owns', () => {
    const dir = run();
    const names = (role: keyof typeof ROLES) => videogenTools({ role: ROLES[role], runDir: dir, ports: ports(), specs: new SpecStore(join(dir, 'spec')) }).map((t) => t.name).sort();
    expect(names('researcher')).toEqual(['get_context', 'report_progress']);
    expect(names('builder')).toEqual(['get_context', 'read_spec', 'register_artifact', 'report_progress', 'write_spec']);
    expect(names('summarizer')).toEqual([]);
  });

  it('report_progress forwards to the port and returns the clamped value; get_context returns the context', async () => {
    const dir = run();
    const p = ports();
    const tools = videogenTools({ role: ROLES.builder, runDir: dir, ports: p, specs: new SpecStore(join(dir, 'spec')) });
    expect(text(await call(tools, 'report_progress', { percent: 120, message: 'geometri' }))).toBe('ok: 99');
    expect(p.calls).toEqual([['progress', 120, 'geometri']]);
    expect(JSON.parse(text(await call(tools, 'get_context', {})))).toEqual({ sessionId: 's1', role: 'builder' });
  });

  it('write_spec versions, validates and returns the diff; read_spec reads latest or a given version', async () => {
    const dir = run();
    const specs = new SpecStore(join(dir, 'spec'), zodValidator({ scene: z.object({ units: z.literal('cm'), parts: z.array(z.string()) }) }));
    const tools = videogenTools({ role: ROLES.builder, runDir: dir, ports: ports(), specs });
    const w1 = JSON.parse(text(await call(tools, 'write_spec', { kind: 'scene', content: { units: 'cm', parts: ['yay'] } })));
    expect(w1).toEqual({ version: 1, diff: [{ path: '$', op: 'add' }] });
    const w2 = JSON.parse(text(await call(tools, 'write_spec', { kind: 'scene', content: { units: 'cm', parts: ['yay', 'gövde'] } })));
    expect(w2).toEqual({ version: 2, diff: [{ path: '$.parts[1]', op: 'add' }] });
    expect(JSON.parse(text(await call(tools, 'read_spec', { kind: 'scene' })))).toEqual({ version: 2, value: { units: 'cm', parts: ['yay', 'gövde'] } });
    expect(JSON.parse(text(await call(tools, 'read_spec', { kind: 'scene', version: 1 }))).value.parts).toEqual(['yay']);
    const bad = await call(tools, 'write_spec', { kind: 'scene', content: { units: 'mm', parts: [] } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/units/);
    const forbidden = await call(tools, 'write_spec', { kind: 'storyboard', content: {} });
    expect(forbidden.isError).toBe(true);
    expect((await call(tools, 'read_spec', { kind: 'audio' })).isError).toBe(true);
  });

  it('register_artifact accepts files inside the run dir only', async () => {
    const dir = run();
    const p = ports();
    writeFileSync(join(dir, 'scene', 'a.json'), '{}');
    const tools = videogenTools({ role: ROLES.builder, runDir: dir, ports: p, specs: new SpecStore(join(dir, 'spec')) });
    expect((await call(tools, 'register_artifact', { path: '/etc/passwd', kind: 'x' })).isError).toBe(true);
    expect((await call(tools, 'register_artifact', { path: 'scene/missing.json', kind: 'x' })).isError).toBe(true);
    const ok = await call(tools, 'register_artifact', { path: 'scene/a.json', kind: 'scene_spec' });
    expect(ok.isError).toBeFalsy();
    expect(p.calls).toEqual([['artifact', join(dir, 'scene', 'a.json'), 'scene_spec']]);
  });

  it('diffJson reports nested adds, removes and replaces', () => {
    expect(diffJson({ a: 1, b: { c: [1, 2] }, d: 'x' }, { a: 2, b: { c: [1] }, e: true })).toEqual([
      { path: '$.a', op: 'replace' }, { path: '$.b.c[1]', op: 'remove' }, { path: '$.d', op: 'remove' }, { path: '$.e', op: 'add' },
    ]);
    expect(diffJson({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
