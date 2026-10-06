import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { cleanChildEnv } from '../../packages/shared/src/paid-key-guard.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const DB = 'videogen_smoke';
const ADMIN = 'postgres://videogen:videogen@127.0.0.1:5433/videogen';
const ADMIN_SMOKE = `postgres://videogen:videogen@127.0.0.1:5433/${DB}`;
const APP_SMOKE = `postgres://videogen_app:videogen_app@127.0.0.1:5433/${DB}`;
const SMOKE_DIR = '/tmp/videogen-smoke'; // keep in sync with helpers.ts

// Any failing setup step exits non-zero with one clear line, so Playwright reports "exited early".
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.error || r.status !== 0) {
    const why = r.error ? (r.error.code ?? r.error.message) : r.signal ? `signal ${r.signal}` : `exit ${r.status}`;
    console.error(`[smoke] setup failed: ${cmd} ${args.join(' ')} (${why})`);
    process.exit(1);
  }
}

async function dropDb() {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.end();
}

run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
rmSync(SMOKE_DIR, { recursive: true, force: true });
mkdirSync(join(SMOKE_DIR, 'data'), { recursive: true });
await dropDb();
{
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
}

const env = {
  ...cleanChildEnv(process.env),
  VG_PORT: '5190',
  VG_DATABASE_URL: APP_SMOKE,
  VG_ADMIN_DATABASE_URL: ADMIN_SMOKE,
  VG_DATA_DIR: join(SMOKE_DIR, 'data'),
  VG_FIXTURE_CLAUDE_AUTH: join(ROOT, 'tests/fixtures/claude-auth-status.json'),
  VG_FIXTURE_USAGE: join(ROOT, 'tests/fixtures/usage-response.sample.json'),
  VG_USAGE_POLL_MS: '60000',
  VG_LOG_LEVEL: 'warn',
  // M3: recorded Claude streams instead of real sessions; dev endpoint to start them; short liveness thresholds for S3.
  VG_CLAUDE_DRIVER: 'fake',
  VG_DEV_ENDPOINTS: '1',
  VG_FAKE_SPEED: '0.3',
  VG_FAKE_CHAT: 'websearch,coding',
  VG_QUIET_AFTER_MS: '3000',
  VG_STUCK_AFTER_MS: '6000',
  // M4b: committed pen build outputs and ffmpeg test stills instead of Blender/bubblewrap/GPU (spec §16.1).
  VG_RENDER_DRIVER: 'fake',
  VG_FFMPEG: spawnSync('bash', ['-lc', 'command -v ffmpeg']).stdout?.toString().trim() || 'ffmpeg',
};
for (const k of ['ANTHROPIC_API_KEY', 'CLAUDECODE']) delete env[k];

run('npx', ['tsx', 'packages/db/src/migrate-cli.ts'], { env });
// Always build: a stale apps/web/dist would make the smoke test an old bundle (the API serves files present at start).
run('npm', ['run', 'build']);

const kids = new Map();
const pids = {};
let stopping = false;

/** api and worker are restarted on unexpected exit, so S4 can kill them and watch the UI recover. */
function supervise(name, entry) {
  const child = spawn(process.execPath, ['--import', 'tsx', entry], { cwd: ROOT, env, stdio: 'inherit' });
  kids.set(name, child);
  pids[name] = child.pid;
  writeFileSync(join(SMOKE_DIR, 'pids.json'), JSON.stringify(pids));
  child.on('exit', () => {
    if (kids.get(name) === child) kids.delete(name);
    const restart = () => {
      if (stopping) return;
      // S4 holds the worker down long enough for the footer's 6 s heartbeat timeout to show "Worker yanıt vermiyor".
      if (existsSync(join(SMOKE_DIR, `hold-${name}`))) { setTimeout(restart, 200); return; }
      supervise(name, entry);
    };
    setTimeout(restart, 300);
  });
}
supervise('api', 'apps/api/src/main.ts');
supervise('worker', 'apps/worker/src/main.ts');

/** Playwright sends SIGTERM to the group (gracefulShutdown): stop children, then drop the DB and the data dir. */
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const k of kids.values()) k.kill('SIGTERM');
  const deadline = Date.now() + 3000;
  while (kids.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  for (const k of kids.values()) k.kill('SIGKILL');
  await dropDb().catch((e) => console.error(`[smoke] drop ${DB} failed: ${e?.code ?? e}`));
  rmSync(SMOKE_DIR, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
