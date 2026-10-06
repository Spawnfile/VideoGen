import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RoleName } from '@videogen/shared';
import type { RoleDef } from './roles.ts';

export const PLUGIN_DIR = resolve(import.meta.dirname, '../../../claude-plugin');

/** Body of claude-plugin/agents/<role>.md without its frontmatter. */
export function loadRolePrompt(role: RoleName, dir = PLUGIN_DIR): string {
  const raw = readFileSync(resolve(dir, 'agents', `${role}.md`), 'utf8');
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

/** Appended to the claude_code preset system prompt. */
export function rolePromptFor(def: RoleDef, dir: string, ctx: { runDir: string; sessionId: string }): string {
  const scope = def.writeDirs === null ? 'the whole run directory' : def.writeDirs.length ? def.writeDirs.map((d) => `./${d}/`).join(', ') : 'nowhere (read-only role)';
  return [
    loadRolePrompt(def.role, dir),
    '',
    '## Session',
    `- Working directory (run directory): ${ctx.runDir}`,
    `- You may write to: ${scope}`,
    `- Session id: ${ctx.sessionId}`,
    '- Heavy work (Blender, Remotion, ffmpeg, TTS) only through the videogen MCP tools; Bash is limited to ls, cat, head, jq and python3 -m py_compile.',
  ].join('\n');
}
