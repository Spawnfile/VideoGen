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
    expect(allowedTools(ROLES.reviewer_visual)).not.toContain('mcp__videogen__run_qc');
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
});
