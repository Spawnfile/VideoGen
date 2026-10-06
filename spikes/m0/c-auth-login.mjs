// Spike (c): how does the SDK-bundled CLI's `auth login` behave without a TTY?
// SAFETY: isolated CLAUDE_CONFIG_DIR (mkdtemp under tmpdir), BROWSER=/bin/true, nothing is ever written to the
// child's stdin, the OAuth URL is never opened, the child is killed by PID after 15 s, temp dir removed at the end.
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

const pkg = resolve(import.meta.dirname, 'node_modules/@anthropic-ai/claude-agent-sdk-linux-x64');
const bin = readdirSync(pkg, { recursive: true }).map((f) => join(pkg, f)).find((f) => statSync(f).isFile() && (statSync(f).mode & 0o100));

const isolated = mkdtempSync(join(tmpdir(), 'vg-auth-'));
if (!isolated.startsWith(tmpdir()) || isolated.startsWith(join(homedir(), '.claude'))) throw new Error('refusing: config dir must be isolated');

const DROP = /^(CLAUDECODE$|CLAUDE_CODE_|ANTHROPIC_API_KEY$|ANTHROPIC_AUTH_TOKEN$)/;
const env = {};
for (const [k, v] of Object.entries(process.env)) if (!DROP.test(k) && v !== undefined) env[k] = v;
env.CLAUDE_CONFIG_DIR = isolated;
env.BROWSER = '/bin/true'; // deviation: never pop the user's real browser

// mask query-string values (state / code_challenge / client tokens) before anything is printed
const mask = (s) => s.replace(/([?&][^=\s&#]+=)[^&\s#]*/g, '$1…');

const st = spawnSync(bin, ['auth', 'status'], { env, encoding: 'utf8' });
console.log('status (isolated):', mask((st.stdout + st.stderr).trim()), '| exit', st.status);

const child = spawn(bin, ['auth', 'login', '--claudeai'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
let out = '';
let exit = null;
child.on('exit', (code, signal) => (exit = { code, signal }));
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));

// listener sampling: does the child open a localhost callback server?
const listeners = new Set();
const sample = () => {
  try {
    for (const l of execFileSync('ss', ['-ltnp'], { encoding: 'utf8' }).split('\n')) if (l.includes(`pid=${child.pid},`)) listeners.add(l.trim().replace(/\s+/g, ' '));
  } catch {}
};
for (let i = 0; i < 15; i++) { await new Promise((r) => setTimeout(r, 1000)); sample(); }

const aliveAtWindowEnd = exit === null;
const pid = child.pid;
if (exit === null) {
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 2000));
  if (exit === null) { try { process.kill(pid, 'SIGKILL'); } catch {} await new Promise((r) => setTimeout(r, 500)); }
}
let stillAlive = true;
try { process.kill(pid, 0); } catch { stillAlive = false; }

const url = out.match(/https:\/\/\S+/)?.[0];
const u = url ? new URL(url) : null;
const files = readdirSync(isolated, { recursive: true });
console.log(JSON.stringify({
  printedUrl: Boolean(url),
  urlHost: u?.host ?? null,
  urlPath: u?.pathname ?? null,
  urlParamNames: u ? [...u.searchParams.keys()] : [],
  redirectUriHost: u?.searchParams.get('redirect_uri') ? new URL(u.searchParams.get('redirect_uri')).host : null,
  asksForCode: /code|paste|kod/i.test(out),
  aliveAtWindowEnd,
  exit,
  childStillAliveAfterKill: stillAlive,
  localListeners: [...listeners].map((l) => l.replace(/users:\(.*$/, 'users:(…)')),
  filesCreatedInIsolatedDir: files,
  rawHead: mask(out.slice(0, 800)),
}, null, 2));

rmSync(isolated, { recursive: true, force: true });
console.log('isolated dir removed:', !existsSync(isolated));

const real = execFileSync('claude', ['auth', 'status'], { encoding: 'utf8', env: { ...process.env, CLAUDECODE: '' } }); // real (default) config dir
console.log('REAL login still intact:', real.includes('"loggedIn": true'));
