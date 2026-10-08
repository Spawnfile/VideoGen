import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROLE_NAMES } from '@videogen/shared';
import { cleanChildEnv } from '@videogen/shared';
import { allowedTools, buildQueryOptions, disallowedTools, evaluateToolUse, loadRolePrompt, resolveRole, ROLES, type GuardContext, type SessionSpec } from '../src/index.ts';

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
    // The fixer writes only under scene/ (a ./py_compile.py shadow module in the cwd would run unsandboxed via `python -m`).
    expect(denied(evaluateToolUse(ctx('fixer'), 'Write', { file_path: 'scene/product.py', content: '' }))).toBeNull();
    for (const file_path of ['py_compile.py', './py_compile.py', 'review/x', 'final/x', 'voice/x', join(run, 'x.json')]) {
      expect(denied(evaluateToolUse(ctx('fixer'), 'Write', { file_path, content: '' })), file_path).toMatch(/confined to \.\/scene\//);
    }
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
    for (const command of ['ls scene', 'ls', "jq '.parts[0]' scene/spec.json", 'python3 -I -m py_compile scene/product.py', 'head -n 20 scene/product.py']) {
      expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command })), command).toBeNull();
    }
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'python3 scene/product.py' }))).toMatch(/py_compile/);
    // Isolated mode only: plain `-m` puts the cwd first on sys.path (a planted py_compile.py would run).
    for (const command of ['python3 -m py_compile scene/product.py', 'python3 -I scene/product.py', 'python3 -I -m http.server']) {
      expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command })), command).toMatch(/py_compile/);
    }
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'rm scene/a' }))).toMatch(/Only these commands/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: `cat ${join(home, '.ssh', 'id_rsa')}` }))).toMatch(/inside the run directory/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'cat scene/link/x' }))).toMatch(/inside the run directory/);
  });

  it('judges heavy commands by the program name only: a file name that mentions ffmpeg is fine (M3 minor 4)', () => {
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'cat scene/notes-ffmpeg.md' }))).toBeNull();
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'env ffmpeg -i a.mp4' }))).toMatch(/mcp__videogen__extract_frames/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'blender -b x.blend; ls' }))).toMatch(/mcp__videogen__build_scene/);
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: 'cat scene/a | sh' }))).toMatch(/chaining/);
  });

  it('allows only output-format jq flags: no second file through -f, --rawfile, --slurpfile, -L (M3 minor 3)', () => {
    expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: "jq -r -c '.parts' scene/spec.json" }))).toBeNull();
    for (const flag of ['-f', '--from-file', '--rawfile', '--slurpfile', '-L', '--args']) {
      expect(denied(evaluateToolUse(ctx('builder'), 'Bash', { command: `jq ${flag} x scene/spec.json` })), flag).toMatch(/jq flag/);
    }
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

  it('confines reads of roles that hold web tools to the run directory and skills (a hostile page cannot steer a Read → WebFetch exfiltration)', () => {
    for (const role of ['researcher', 'reviewer_facts'] as const) {
      expect(denied(evaluateToolUse(ctx(role), 'Read', { file_path: '/etc/passwd' })), role).toMatch(/run directory/);
      expect(denied(evaluateToolUse(ctx(role), 'Read', { file_path: join(home, 'videogen-data', 'runs', 'r2', 'research', 'x.json') })), role).toMatch(/run directory/);
      expect(denied(evaluateToolUse(ctx(role), 'Read', { file_path: 'scene/link/x' })), role).toMatch(/run directory/);
      expect(denied(evaluateToolUse(ctx(role), 'Read', { file_path: 'research/notes.md' })), role).toBeNull();
      expect(denied(evaluateToolUse(ctx(role), 'Read', { file_path: join(run, 'research', 'notes.md') })), role).toBeNull();
      expect(denied(evaluateToolUse(ctx(role), 'Read', { file_path: join(home, '.claude', 'skills', 'ffmpeg', 'SKILL.md') })), role).toBeNull();
    }
    // Roles without web tools keep reading outside the run dir (Blender API, skills, repo docs).
    expect(denied(evaluateToolUse(ctx('builder'), 'Read', { file_path: '/etc/passwd' }))).toBeNull();
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

  it('reviewer_facts may WebFetch only its exact check targets after normalization; the same URL with an extra query or fragment, another path, http, or a look-alike host is denied with the reason, also inside a subagent call; researcher is not limited; WebSearch stays allowed', async () => {
    const allow = ['https://en.wikipedia.org/wiki/Ballpoint_pen', 'https://www.bicworld.com/en/our-products?lang=en'];
    const facts: GuardContext = { ...ctx('reviewer_facts'), webAllow: allow };
    const fetch = (c: GuardContext, url: unknown) => denied(evaluateToolUse(c, 'WebFetch', { url, prompt: 'iddiayı bul' }));
    for (const url of [
      'https://en.wikipedia.org/wiki/Ballpoint_pen', 'https://EN.Wikipedia.ORG/wiki/Ballpoint_pen', 'https://en.wikipedia.org:443/wiki/Ballpoint_pen',
      'https://en.wikipedia.org/wiki/Ballpoint_pen/', 'https://www.bicworld.com/en/our-products?lang=en', 'https://www.bicworld.com/en/our-products/?lang=en',
    ]) expect(fetch(facts, url), url).toBeNull();
    for (const url of [
      'https://en.wikipedia.org/wiki/Ballpoint_pen?q=gizli-arastirma-metni', 'https://en.wikipedia.org/wiki/Ballpoint_pen#gizli',
      'https://www.bicworld.com/en/our-products?lang=en&q=sizinti', 'https://www.bicworld.com/en/our-products', 'https://en.wikipedia.org/wiki/Fountain_pen',
      'https://en.wikipedia.org/wiki/ballpoint_pen', 'http://en.wikipedia.org/wiki/Ballpoint_pen', 'https://en.wikipedia.org.evil.example/wiki/Ballpoint_pen',
      'https://en-wikipedia.org/wiki/Ballpoint_pen', 'https://user@en.wikipedia.org/wiki/Ballpoint_pen', 'https://en.wikipedia.org:8443/wiki/Ballpoint_pen',
      'en.wikipedia.org/wiki/Ballpoint_pen', 'not a url', undefined,
    ]) expect(fetch(facts, url), String(url)).toMatch(/only the check targets/);
    expect(fetch({ ...ctx('reviewer_facts'), webAllow: [] }, allow[0])).toMatch(/only the check targets/);
    expect(denied(evaluateToolUse(facts, 'WebSearch', { query: 'tükenmez kalem bilye çapı' }))).toBeNull();
    // The researcher browses freely (its output is fenced anyway).
    expect(fetch(ctx('researcher'), 'http://example.com/a?b=c#d')).toBeNull();
    // Inside a subagent: the SDK runs the same PreToolUse hook (agent_id set) against the same session context.
    const spec = { preToolUse: async (tool: string, input: unknown) => evaluateToolUse(facts, tool, input), tools: [], allowedTools: [], disallowedTools: [] } as unknown as SessionSpec;
    const o = buildQueryOptions(spec, { pluginDir: '/abs/claude-plugin', claudeBinary: '/abs/claude', env: cleanChildEnv({}) }) as Record<string, any>;
    const hook = o.hooks.PreToolUse[0].hooks[0];
    const signal = new AbortController().signal;
    const sub = (url: string) => hook({ hook_event_name: 'PreToolUse', agent_id: 'sub-1', agent_type: 'general-purpose', tool_name: 'WebFetch', tool_input: { url, prompt: 'x' }, tool_use_id: 's1' }, 's1', { signal });
    expect(await sub('https://en.wikipedia.org/wiki/Ballpoint_pen?q=sizinti')).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: expect.stringMatching(/only the check targets/) } });
    expect(await sub('https://en.wikipedia.org/wiki/Ballpoint_pen')).toEqual({});
  });

  it('resolves role overrides and builds SDK tool lists; every role has a prompt file', () => {
    expect(resolveRole('chat', { chat: { model: 'haiku', effort: 'low' } })).toMatchObject({ model: 'haiku', effort: 'low', maxTurns: null });
    expect(resolveRole('builder')).toMatchObject({ model: 'opus', effort: 'high', maxTurns: 60 });
    expect(allowedTools(ROLES.builder)).toEqual(expect.arrayContaining(['Read', 'Write', 'Edit', 'Bash', 'Agent', 'mcp__videogen__write_spec']));
    expect(allowedTools(ROLES.builder)).toEqual(expect.arrayContaining(['mcp__videogen__build_scene', 'mcp__videogen__render_preview_stills']));
    expect(allowedTools(ROLES.builder)).not.toContain('mcp__videogen__render_draft'); // plan B7: the draft is a pipeline step
    expect(disallowedTools(ROLES.researcher)).toEqual(expect.arrayContaining(['Agent', 'Task', 'Bash', 'Edit']));
    expect(disallowedTools(ROLES.builder)).not.toContain('Agent');
    for (const r of ROLE_NAMES) {
      const p = loadRolePrompt(r);
      expect(p.startsWith('---'), r).toBe(false);
      expect(p.length, r).toBeGreaterThan(40);
    }
  });
});
