import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Config {
  host: '127.0.0.1';
  port: number;
  databaseUrl: string;
  adminDatabaseUrl: string;
  dataDir: string;
  webDist: string;
  fixtures: { claudeAuthStatus?: string; usage?: string };
  usagePollMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: '127.0.0.1',
    port: Number(env.VG_PORT ?? 5180),
    databaseUrl: env.VG_DATABASE_URL ?? 'postgres://videogen_app:videogen_app@127.0.0.1:5433/videogen',
    adminDatabaseUrl: env.VG_ADMIN_DATABASE_URL ?? 'postgres://videogen:videogen@127.0.0.1:5433/videogen',
    dataDir: env.VG_DATA_DIR ?? join(homedir(), 'videogen-data'),
    webDist: env.VG_WEB_DIST ?? resolve(import.meta.dirname, '../../../apps/web/dist'),
    fixtures: { claudeAuthStatus: env.VG_FIXTURE_CLAUDE_AUTH, usage: env.VG_FIXTURE_USAGE },
    usagePollMs: Number(env.VG_USAGE_POLL_MS ?? 300_000),
  };
}
