import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { cleanChildEnv } from '../../packages/shared/src/paid-key-guard.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const DB = 'videogen_smoke';
const ADMIN = 'postgres://videogen:videogen@127.0.0.1:5433/videogen';
const ADMIN_SMOKE = `postgres://videogen:videogen@127.0.0.1:5433/${DB}`;
const APP_SMOKE = `postgres://videogen_app:videogen_app@127.0.0.1:5433/${DB}`;

// Any failing setup step exits non-zero with one clear line, so Playwright reports "exited early"
// instead of waiting out its 120 s webServer timeout.
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.error || r.status !== 0) {
    const why = r.error ? (r.error.code ?? r.error.message) : r.signal ? `signal ${r.signal}` : `exit ${r.status}`;
    console.error(`[smoke] setup failed: ${cmd} ${args.join(' ')} (${why})`);
    process.exit(1);
  }
}

run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
const admin = new pg.Client({ connectionString: ADMIN });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${DB}`);
await admin.end();

const env = {
  ...cleanChildEnv(process.env),
  VG_PORT: '5190',
  VG_DATABASE_URL: APP_SMOKE,
  VG_ADMIN_DATABASE_URL: ADMIN_SMOKE,
  VG_DATA_DIR: mkdtempSync(join(tmpdir(), 'videogen-smoke-')),
  VG_FIXTURE_CLAUDE_AUTH: join(ROOT, 'tests/fixtures/claude-auth-status.json'),
  VG_FIXTURE_USAGE: join(ROOT, 'tests/fixtures/usage-response.sample.json'),
  VG_USAGE_POLL_MS: '60000',
  VG_LOG_LEVEL: 'warn',
};
for (const k of ['ANTHROPIC_API_KEY', 'CLAUDECODE']) delete env[k]; // cleanChildEnv already strips every paid-key name and CLAUDE_CODE_*

run('npx', ['tsx', 'packages/db/src/migrate-cli.ts'], { env });
// Always build: a stale apps/web/dist would make the smoke test an old bundle (the API serves files present at start).
run('npm', ['run', 'build']);

const kids = ['apps/api/src/main.ts', 'apps/worker/src/main.ts'].map((entry) =>
  spawn(process.execPath, ['--import', 'tsx', entry], { cwd: ROOT, env, stdio: 'inherit' }),
);
const stop = () => { for (const k of kids) k.kill('SIGTERM'); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
