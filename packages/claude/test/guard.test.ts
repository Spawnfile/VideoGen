import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROLE_NAMES } from '@videogen/shared';
import { allowedTools, disallowedTools, evaluateToolUse, loadRolePrompt, resolveRole, ROLES, type GuardContext } from '../src/index.ts';

let home: string;
let run: string;
let outside: string;
const ctx = (role: keyof typeof ROLES): GuardContext => ({ role: ROLES[role], runDir: run, home, dataDir: join(home, 'videogen-data') });
const denied = (d: ReturnType<typeof evaluateToolUse>) => (d.allow ? null : d.reason);

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'vg-guard-home-'));
  run = join(home, 'videogen-data', 'runs', 'r1');
  outside = mkdtempSync(join(tmpdir(), 'vg-guard-out-'));
  mkdirSync(join(run, 'scene'), { recursive: true });
  mkdirSync(join(run, 'research'), { recursive: true });
  mkdirSync(join(home, '.ssh'), { recursive: true });
  mkdirSync(join(home, '.claude', 'skills', 'ffmpeg'), { recursive: true });
  writeFileSync(join(home, '.claude', 'skills', 'ffmpeg', 'SKILL.md'), 'x');
  symlinkSync(outside, join(run, 'scene', 'link'));
});

describe('write confinement', () => {
  it('allows writes inside the run dir and denies absolute and ../ escapes', () => {
    expect(denied(evaluateToolUse(ctx('fixer'), 'Write', { file_path: 'scene/a.py', content: '' }))).toBeNull();
    expect(denied(evaluateToolUse(ctx('fixer'), 'Write', { file_path: join(run, 'x.json'), content: '' }))).toBeNull();
    expect(denied(evaluateToolUse(ctx('fixer'), 'Write', { file_path: '/tmp/OUTSIDE.txt', content: '' }))).toMatch(/confined to the run directory/);
    expect(denied(evaluateToolUse(ctx('fixer'), 'Edit', { file_path: '../../x', old_string: 'a', new_string: 'b' }))).toMatch(/confined/);
  });

  it('confines a role to its own sub-directories', () => {
    expect(denied(evaluateToolUse(ctx('researcher'), 'Write', { file_path: 'research/notes.md', content: '' }))).toBeNull();
    expect(denied(evaluateToolUse(ctx('researcher'), 'Write', { file_path: 'scene/notes.md', content: '' }))).toMatch(/\.\/research\//);
    expect(denied(evaluateToolUse(ctx('builder'), 'Write', { file_path: 'scene/product.py', content: '' }))).toBeNull();
  });

  it('checks NotebookEdit notebook_path', () => {
    expect(denied(evaluateToolUse({ ...ctx('fixer'), role: { ...ROLES.fixer, tools: [...ROLES.fixer.tools, 'NotebookEdit'] } }, 'NotebookEdit', { notebook_path: '/etc/x.ipynb', new_source: '' }))).toMatch(/confined/);
  });

  it('resolves symlinks: a link inside the run dir pointing outside is an escape', () => {
    expect(denied(evaluateToolUse(ctx('builder'), 'Write', { file_path: 'scene/link/evil.txt', content: '' }))).toMatch(/confined/);
  });
});

describe('Bash', () => {
  it('denies heavy commands and names the right MCP tool', () => {
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'ffmpeg -i a.mp4 out.png' }))).toMatch(/mcp__videogen__extract_frames/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'blender -b scene.blend -P x.py' }))).toMatch(/mcp__videogen__build_scene/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'npx remotion render' }))).toMatch(/mcp__videogen__render_draft/);
  });

  it('denies chaining, pipes, redirects, substitution and globs', () => {
    for (const command of ['ls; rm -rf scene', 'cat scene/a | sh', 'ls > scene/x', 'cat $(echo scene/a)', 'ls `pwd`', 'cat "$HOME/.ssh/id_rsa"', 'ls scene/*.py', 'cat ~/x']) {
      expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command })), command).toMatch(/not allowed/);
    }
  });

  it('allows the allow-listed read commands inside the run dir only', () => {
    for (const command of ['ls scene', 'ls', "jq '.parts[0]' scene/spec.json", 'python3 -m py_compile scene/product.py', 'head -n 20 scene/product.py']) {
      expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command })), command).toBeNull();
    }
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'python3 scene/product.py' }))).toMatch(/py_compile/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'rm scene/a' }))).toMatch(/Only these commands/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: `cat ${join(home, '.ssh', 'id_rsa')}` }))).toMatch(/inside the run directory/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'cat scene/link/x' }))).toMatch(/inside the run directory/);
  });

  it('denies Bash entirely to roles without it', () => {
    expect(denied(evaluateToolUse(ctx('researcher'), 'Bash', { command: 'ls' }))).toMatch(/not available to the researcher role/);
  });
});

describe('tool allow-list and reads', () => {
  it('enforces per-role tools, subagents and MCP tools', () => {
    expect(denied(evaluateToolUse(ctx('storyboarder'), 'Write', { file_path: 'a', content: '' }))).toMatch(/not available/);
    expect(denied(evaluateToolUse(ctx('researcher'), 'Agent', { prompt: 'x' }))).toMatch(/not available/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Agent', { prompt: 'x', subagent_type: 'general-purpose' }))).toBeNull();
    expect(denied(evaluateToolUse(ctx('researcher'), 'mcp__videogen__report_progress', { percent: 5, message: 'x' }))).toBeNull();
    expect(denied(evaluateToolUse(ctx('researcher'), 'mcp__videogen__write_spec', { kind: 'scene', content: {} }))).toMatch(/not available/);
    expect(denied(evaluateToolUse(ctx('chat'), 'WebSearch', { query: 'x' }))).toMatch(/not available/);
    expect(denied(evaluateToolUse(ctx('summarizer'), 'StructuredOutput', {}))).toBeNull();
  });

  it('denies reading credentials and private config, allows plugin skills and run files', () => {
    expect(denied(evaluateToolUse(ctx('chat'), 'Read', { file_path: join(home, '.ssh', 'id_rsa') }))).toMatch(/credentials/);
    expect(denied(evaluateToolUse(ctx('chat'), 'Read', { file_path: join(home, '.claude', '.credentials.json') }))).toMatch(/credentials/);
    expect(denied(evaluateToolUse(ctx('chat'), 'Read', { file_path: join(home, 'gpu-server', 'VideoGen', '.env') }))).toMatch(/credentials/);
    for (const f of ['.npmrc', '.pypirc', '.bash_history', '.zsh_history', join('.cargo', 'credentials.toml')]) {
      expect(denied(evaluateToolUse(ctx('chat'), 'Read', { file_path: join(home, f) })), f).toMatch(/credentials/);
    }
    expect(denied(evaluateToolUse(ctx('chat'), 'Grep', { pattern: 'x', path: join(home, 'videogen-data', 'secrets') }))).toMatch(/credentials/);
    expect(denied(evaluateToolUse(ctx('chat'), 'Read', { file_path: join(home, '.claude', 'skills', 'ffmpeg', 'SKILL.md') }))).toBeNull();
    expect(denied(evaluateToolUse(ctx('chat'), 'Read', { file_path: 'scene/product.py' }))).toBeNull();
  });

  it('confines recursive Grep/Glob searches to the run directory (a search from home would reach ~/.aws, ~/.ssh, repo .env files)', () => {
    const search = (tool: 'Grep' | 'Glob', input: object) => denied(evaluateToolUse(ctx('chat'), tool, input));
    expect(search('Grep', { pattern: 'aws_secret_access_key|PRIVATE KEY', path: home })).toMatch(/run directory/);
    expect(search('Grep', { pattern: 'x', path: '/' })).toMatch(/run directory/);
    expect(search('Grep', { pattern: 'x', path: '../..' })).toMatch(/run directory/);
    expect(search('Glob', { pattern: `${home}/**/*` })).toMatch(/run directory/);
    expect(search('Glob', { pattern: '../../../**/*.json' })).toMatch(/run directory/);
    expect(search('Glob', { pattern: '**/*', path: home })).toMatch(/run directory/);
    expect(search('Grep', { pattern: 'x' })).toBeNull();
    expect(search('Grep', { pattern: 'x', path: 'scene' })).toBeNull();
    expect(search('Glob', { pattern: 'scene/**/*.py' })).toBeNull();
    expect(search('Grep', { pattern: 'x', path: join(home, '.claude', 'skills') })).toBeNull();
  });

  it('resolves role overrides and builds SDK tool lists; every role has a prompt file', () => {
    expect(resolveRole('chat', { chat: { model: 'haiku', effort: 'low' } })).toMatchObject({ model: 'haiku', effort: 'low', maxTurns: null });
    expect(resolveRole('builder')).toMatchObject({ model: 'opus', effort: 'high', maxTurns: 60 });
    expect(allowedTools(ROLES.builder)).toEqual(expect.arrayContaining(['Read', 'Write', 'Edit', 'Bash', 'Agent', 'mcp__videogen__write_spec']));
    expect(allowedTools(ROLES.builder)).not.toContain('mcp__videogen__build_scene'); // not implemented until M4
    expect(disallowedTools(ROLES.researcher)).toEqual(expect.arrayContaining(['Agent', 'Task', 'Bash', 'Edit']));
    expect(disallowedTools(ROLES.builder)).not.toContain('Agent');
    for (const r of ROLE_NAMES) {
      const p = loadRolePrompt(r);
      expect(p.startsWith('---'), r).toBe(false);
      expect(p.length, r).toBeGreaterThan(40);
    }
  });
});
