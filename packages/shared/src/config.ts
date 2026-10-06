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
  claudeDriver: 'sdk' | 'fake';
  devEndpoints: boolean;
  liveness: { quietAfterMs: number; stuckAfterMs: number };
  chatIdleMs: number;
  /** M4b: Blender, bubblewrap and ffmpeg ('fake': committed pen outputs and ffmpeg test stills, spec §16.1). */
  render: { driver: 'real' | 'fake'; blender: string; bwrap: string; ffmpeg: string };
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
    claudeDriver: env.VG_CLAUDE_DRIVER === 'fake' ? 'fake' : 'sdk',
    devEndpoints: env.VG_DEV_ENDPOINTS === '1',
    liveness: { quietAfterMs: Number(env.VG_QUIET_AFTER_MS ?? 10_000), stuckAfterMs: Number(env.VG_STUCK_AFTER_MS ?? 120_000) },
    chatIdleMs: Number(env.VG_CHAT_IDLE_MS ?? 600_000),
    render: {
      driver: env.VG_RENDER_DRIVER === 'fake' ? 'fake' : 'real',
      blender: env.VG_BLENDER ?? join(homedir(), 'apps/blender-5.2.2-linux-x64/blender'),
      bwrap: env.VG_BWRAP ?? '/usr/bin/bwrap',
      ffmpeg: env.VG_FFMPEG ?? 'ffmpeg',
    },
  };
}
