import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { cleanChildEnv } from '../../packages/shared/src/paid-key-guard.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const DB = 'videogen_smoke';
const ADMIN = 'postgres://videogen:videogen@127.0.0.1:5433/videogen';
const ADMIN_SMOKE = `postgres://videogen:videogen@127.0.0.1:5433/${DB}`;
const APP_SMOKE = `postgres://videogen_app:videogen_app@127.0.0.1:5433/${DB}`;

spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], { cwd: ROOT, stdio: 'inherit' });
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

spawnSync('npx', ['tsx', 'packages/db/src/migrate-cli.ts'], { cwd: ROOT, env, stdio: 'inherit' });
if (!existsSync(join(ROOT, 'apps/web/dist/index.html'))) spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

const kids = ['apps/api/src/main.ts', 'apps/worker/src/main.ts'].map((entry) =>
  spawn(process.execPath, ['--import', 'tsx', entry], { cwd: ROOT, env, stdio: 'inherit' }),
);
const stop = () => { for (const k of kids) k.kill('SIGTERM'); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
