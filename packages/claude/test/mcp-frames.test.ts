import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { allowedTools, ROLES, SpecStore, videogenTools, type McpPorts } from '../src/index.ts';

const base = (): McpPorts => ({ reportProgress: async (p) => p, registerArtifact: async () => ({ sha256: 'f'.repeat(64), bytes: 1, mime: 'x' }), context: () => ({}) });
const dir = () => mkdtempSync(join(tmpdir(), 'vg-mcp-frames-'));

describe('extract_frames MCP tool', () => {
  it('exists only for a reviewer whose session got the port (never chat), and the reviewer may call it without asking', () => {
    const d = dir();
    const names = (role: keyof typeof ROLES, ports: McpPorts) => videogenTools({ role: ROLES[role], runDir: d, ports, specs: new SpecStore(join(d, 'spec')) }).map((t) => t.name).sort();
    const withPort = { ...base(), extractFrames: vi.fn() };
    expect(names('reviewer_visual', base())).toEqual(['get_context']);
    expect(names('reviewer_visual', withPort)).toEqual(['extract_frames', 'get_context']);
    expect(names('chat', base())).not.toContain('extract_frames');
    expect(allowedTools(ROLES.reviewer_visual)).toContain('mcp__videogen__extract_frames');
    expect(allowedTools(ROLES.reviewer_visual)).toContain('mcp__videogen__run_qc');
    expect(ROLES.reviewer_facts.maxTurns).toBe(40);
  });

  it('forwards times and crop to the port and turns a port error (budget) into a tool error', async () => {
    const d = dir();
    const extractFrames = vi.fn(async () => ({ frames: [{ time: 1, frame: 30, path: 'review/r0/frames/t001000.png' }], remaining: 11 }));
    const tools = videogenTools({ role: ROLES.reviewer_visual, runDir: d, ports: { ...base(), extractFrames }, specs: new SpecStore(join(d, 'spec')) });
    const tool = tools.find((t) => t.name === 'extract_frames')!;
    const ok = await tool.handler({ times: [1], crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
    expect(JSON.parse(ok.content[0]!.text)).toMatchObject({ remaining: 11 });
    expect(extractFrames).toHaveBeenCalledWith({ times: [1], crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
    extractFrames.mockRejectedValueOnce(new Error('Kare bütçesi: bu incelemede en çok 12 tek kare; kalan 0.'));
    const bad = await tool.handler({ times: [2] });
    expect([bad.isError, bad.content[0]!.text]).toEqual([true, 'Kare bütçesi: bu incelemede en çok 12 tek kare; kalan 0.']);
  });

  it('run_qc exists only where the worker supplied it and returns the report JSON', async () => {
    const d = dir();
    const report = { pass: false, gates: { G1: true, G5: true, G6: false }, scores: { D6: 12, D7: 4 }, failed: [], measures: [] };
    const runQc = vi.fn(async () => report);
    const names = (role: keyof typeof ROLES, ports: McpPorts) => videogenTools({ role: ROLES[role], runDir: d, ports, specs: new SpecStore(join(d, 'spec')) }).map((t) => t.name);
    expect(names('reviewer_visual', base())).not.toContain('run_qc');
    expect(names('chat', base())).not.toContain('run_qc');
    expect(names('reviewer_visual', { ...base(), runQc })).toContain('run_qc');
    expect(names('reviewer_facts', { ...base(), runQc })).not.toContain('run_qc'); // the role does not own it
    const tool = videogenTools({ role: ROLES.reviewer_retention, runDir: d, ports: { ...base(), runQc }, specs: new SpecStore(join(d, 'spec')) }).find((t) => t.name === 'run_qc')!;
    expect(JSON.parse((await tool.handler({ versionId: 'ignored' })).content[0]!.text)).toEqual(report);
    expect(runQc).toHaveBeenCalledWith();
    runQc.mockRejectedValueOnce(new Error('İncelenecek video yok.'));
    expect(await tool.handler({})).toMatchObject({ isError: true });
    // The fixer may write storyboard and scene specs but not research.
    expect(ROLES.fixer.specWrite).toEqual(['storyboard', 'scene']);
    const write = videogenTools({ role: ROLES.fixer, runDir: d, ports: base(), specs: new SpecStore(join(d, 'spec')) }).find((t) => t.name === 'write_spec')!;
    const denied = await write.handler({ kind: 'research', content: {} });
    expect([denied.isError, denied.content[0]!.text]).toEqual([true, 'the fixer role cannot write the research spec']);
  });

});
