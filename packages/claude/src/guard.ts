import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { GuardDecision } from './driver.ts';
import { obj, str } from './messages.ts';
import { permittedTools, type RoleDef } from './roles.ts';

export interface GuardContext { role: RoleDef; runDir: string; home: string; dataDir: string }

const WRITE_PATH_KEY: Record<string, string> = { Write: 'file_path', Edit: 'file_path', NotebookEdit: 'notebook_path' };
export const FILE_WRITE_TOOLS = new Set(Object.keys(WRITE_PATH_KEY));
const READ_PATH_KEYS = ['file_path', 'notebook_path', 'path'];
const HEAVY: [RegExp, string][] = [
  [/^blender(-gpu)?$/, 'mcp__videogen__build_scene (or mcp__videogen__render_preview_stills)'],
  [/^remotion$/, 'mcp__videogen__render_draft'],
  [/^(ffmpeg|ffprobe)$/, 'mcp__videogen__extract_frames or mcp__videogen__run_qc'],
  [/^(chatterbox|faster_whisper|whisper)$/, 'mcp__videogen__tts_synthesize or mcp__videogen__align_captions'],
];
const BASH_BINS = new Set(['ls', 'cat', 'head', 'jq', 'python3']);
const SECRET_HOME_DIRS = ['.ssh', '.aws', '.gnupg', '.config', '.docker', '.kube', '.claude', 'tiktok-poster'];
const SECRET_FILE = /^(\.env(\..*)?|\.netrc|\.pgpass|\.git-credentials|\.credentials\.json|tokens\.json|\.npmrc|\.pypirc|\.(bash|zsh)_history|credentials(\.toml)?|id_(rsa|ed25519|ecdsa|dsa)(\.pub)?|.+\.pem|.+\.key)$/;
const ALLOW: GuardDecision = { allow: true };
const deny = (reason: string): GuardDecision => ({ allow: false, reason });

/** Resolves symlinks along the longest existing prefix (the target itself may not exist yet). */
function realish(p: string): string {
  let cur = p;
  const rest: string[] = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) return p;
    rest.unshift(basename(cur));
    cur = parent;
  }
  return resolve(realpathSync(cur), ...rest);
}
const inside = (child: string, parent: string): boolean => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

export function isSecretPath(ctx: GuardContext, p: string): boolean {
  const abs = realish(resolve(ctx.runDir, p));
  if (SECRET_FILE.test(basename(abs))) return true;
  if (inside(abs, realish(join(ctx.dataDir, 'secrets')))) return true;
  for (const d of SECRET_HOME_DIRS) {
    if (!inside(abs, join(ctx.home, d))) continue;
    if (d === '.claude' && inside(abs, join(ctx.home, '.claude', 'skills'))) continue;
    return true;
  }
  return false;
}

/** Grep/Glob recurse: the search root is `path` (default: the run dir) plus Glob's literal pattern prefix (absolute or `..`). */
function searchRoot(ctx: GuardContext, tool: string, i: Record<string, unknown>): string {
  const base = resolve(ctx.runDir, str(i.path) ?? '.');
  if (tool !== 'Glob') return base;
  const fixed: string[] = [];
  for (const seg of (str(i.pattern) ?? '').split('/')) {
    if (/[*?[\]{}]/.test(seg)) break;
    fixed.push(seg);
  }
  return resolve(base, fixed.join('/') || '.');
}

const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);

function readableByWebRole(ctx: GuardContext, p: string): boolean {
  const abs = realish(resolve(ctx.runDir, p));
  return inside(abs, realish(ctx.runDir)) || inside(abs, realish(join(ctx.home, '.claude', 'skills')));
}

/** A recursive search from an ancestor (home, /, the repo) would reach secret files a per-path check cannot see. */
function searchDecision(ctx: GuardContext, tool: string, i: Record<string, unknown>): GuardDecision {
  const root = realish(searchRoot(ctx, tool, i));
  if (inside(root, realish(ctx.runDir)) || inside(root, join(ctx.home, '.claude', 'skills'))) return ALLOW;
  return deny(`${tool} searches are confined to the run directory; use Read for a specific file.`);
}

export function writeTarget(tool: string, input: unknown): string | null {
  const key = WRITE_PATH_KEY[tool];
  return key ? (str(obj(input)?.[key]) ?? null) : null;
}

function writeDecision(ctx: GuardContext, p: string): GuardDecision {
  const root = realish(ctx.runDir);
  const abs = realish(resolve(ctx.runDir, p));
  const dirs = ctx.role.writeDirs;
  if (!inside(abs, root)) return deny(`Writes are confined to the run directory${dirs?.length ? ` (${dirs.map((d) => `./${d}/`).join(', ')})` : ''}.`);
  if (dirs === null) return ALLOW;
  if (!dirs.length) return deny(`The ${ctx.role.role} role is read-only.`);
  return dirs.some((d) => inside(abs, join(root, d))) ? ALLOW : deny(`Writes are confined to ${dirs.map((d) => `./${d}/`).join(', ')} inside the run directory.`);
}

/** Shell words, or null when the command contains anything beyond one simple command. */
function splitCommand(cmd: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let q: '"' | "'" | null = null;
  for (const ch of cmd) {
    if (q) {
      if (ch === q) q = null;
      else if (q === '"' && (ch === '$' || ch === '`' || ch === '\\')) return null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; quoted = true; continue; }
    if (/\s/.test(ch)) {
      if (cur || quoted) out.push(cur);
      cur = '';
      quoted = false;
      continue;
    }
    if (';&|`$<>(){}\\!*?~'.includes(ch)) return null;
    cur += ch;
  }
  if (q) return null;
  if (cur || quoted) out.push(cur);
  return out;
}

/** Commands that run their argument as the real program (`npx remotion …`, `env ffmpeg …`). */
const WRAPPERS = new Set(['npx', 'env', 'bash', 'sh', 'xargs', 'nice', 'time', 'timeout', 'nohup', 'exec']);
/** jq flags that read a second file (a path outside the run dir would be read and echoed in the error). M3 minor 3. */
const JQ_FLAGS = /^-(?:[nrjacseSC]+|-(?:null-input|raw-output|join-output|ascii-output|compact-output|slurp|sort-keys|tab|exit-status|color-output|monochrome-output|indent))$/;

function heavyTool(word: string | undefined): string | null {
  const name = basename(word ?? '');
  for (const [re, tool] of HEAVY) if (re.test(name)) return tool;
  return null;
}

function bashDecision(ctx: GuardContext, cmd: string): GuardDecision {
  if (!ctx.role.bash) return deny(`Bash is not available to the ${ctx.role.role} role.`);
  const argv = splitCommand(cmd.trim());
  if (!argv?.length) {
    // Unparseable: still name the right tool when a heavy program is in it (M3: only the program name, not file names).
    const tool = cmd.split(/[\s;&|()`$<>'"]+/).map(heavyTool).find(Boolean);
    if (tool) return deny(`Heavy commands are not allowed in Bash; use ${tool} instead.`);
    return deny('Command chaining, pipes, redirects, substitutions and globs are not allowed; run one allow-listed command.');
  }
  const [bin, ...args] = argv as [string, ...string[]];
  const heavy = heavyTool(bin) ?? (WRAPPERS.has(basename(bin)) ? heavyTool(args[0]) : null);
  if (heavy) return deny(`Heavy commands are not allowed in Bash; use ${heavy} instead.`);
  if (!BASH_BINS.has(bin)) return deny(`Only these commands are allowed: ls, cat, head, jq, python3 -I -m py_compile ("${bin}" is not).`);
  let paths = args.filter((a, i) => !a.startsWith('-') && !(bin === 'head' && /^-[nc]$/.test(args[i - 1] ?? '')));
  if (bin === 'python3') {
    // -I (isolated): `-m` would otherwise put the cwd first on sys.path and import a planted py_compile.py outside the sandbox.
    if (args[0] !== '-I' || args[1] !== '-m' || args[2] !== 'py_compile' || args.length < 4) return deny('python3 is only allowed as: python3 -I -m py_compile <file.py> …');
    paths = args.slice(3);
  }
  if (bin === 'jq') {
    const bad = args.find((a) => a.startsWith('-') && !JQ_FLAGS.test(a));
    if (bad) return deny(`jq flag ${bad} is not allowed (only output-format flags such as -r, -c, -S).`);
    paths = paths.slice(1);
  }
  const root = realish(ctx.runDir);
  for (const p of paths) if (!inside(realish(resolve(ctx.runDir, p)), root)) return deny('Bash may only read inside the run directory.');
  return ALLOW;
}

/** PreToolUse decision for every tool call of a session (and of its subagents). */
export function evaluateToolUse(ctx: GuardContext, tool: string, input: unknown): GuardDecision {
  if (!permittedTools(ctx.role).has(tool)) return deny(`The ${tool} tool is not available to the ${ctx.role.role} role.`);
  if (FILE_WRITE_TOOLS.has(tool)) {
    const p = writeTarget(tool, input);
    return p ? writeDecision(ctx, p) : deny('A file path is required.');
  }
  if (tool === 'Bash') return bashDecision(ctx, str(obj(input)?.command) ?? '');
  const i = obj(input) ?? {};
  const web = ctx.role.tools.some((t) => WEB_TOOLS.has(t));
  for (const k of READ_PATH_KEYS) {
    const p = str(i[k]);
    if (p && isSecretPath(ctx, p)) return deny('Reading credentials or private configuration is not allowed.');
    // A role that also fetches the web reads only its run and the skills: a hostile page cannot steer a Read → WebFetch exfiltration.
    if (p && web && tool === 'Read' && !readableByWebRole(ctx, p)) return deny('Roles with web tools may only read inside the run directory (and skills).');
  }
  if (tool === 'Grep' || tool === 'Glob') return searchDecision(ctx, tool, i);
  return ALLOW;
}
