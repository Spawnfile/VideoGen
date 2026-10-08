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
  render: { driver: 'real' | 'fake'; blender: string; bwrap: string; ffmpeg: string; encodePreset: string };
  /** M5c: the voice CLI (`python -m audio_service.voice_cli`), its Freya venv and the offline weights (spec §9, plan H2/H7). */
  audio: { python: string; freyaPython: string; modelsDir: string; hfHome: string };
  /** M6: TikTok Content Posting (plan Y7, Y16, Y19); secrets live in `<dataDir>/secrets`. */
  tiktok: { base: string; pollMs: number; ratePerMinute: number; callbackPort: number };
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
    // M3 minor 5: the dev session endpoint must never open real Claude sessions.
    devEndpoints: env.VG_DEV_ENDPOINTS === '1' && env.VG_CLAUDE_DRIVER === 'fake',
    liveness: { quietAfterMs: Number(env.VG_QUIET_AFTER_MS ?? 10_000), stuckAfterMs: Number(env.VG_STUCK_AFTER_MS ?? 120_000) },
    chatIdleMs: Number(env.VG_CHAT_IDLE_MS ?? 600_000),
    render: {
      driver: env.VG_RENDER_DRIVER === 'fake' ? 'fake' : 'real',
      blender: env.VG_BLENDER ?? join(homedir(), 'apps/blender-5.2.2-linux-x64/blender'),
      bwrap: env.VG_BWRAP ?? '/usr/bin/bwrap',
      ffmpeg: env.VG_FFMPEG ?? 'ffmpeg',
      /** x264 preset of the final delivery encode (plan E8); smoke runs `ultrafast`. */
      encodePreset: env.VG_ENCODE_PRESET ?? 'slow',
    },
    audio: {
      python: env.VG_AUDIO_PYTHON ?? resolve(import.meta.dirname, '../../../python/audio_service/.venv/bin/python'),
      freyaPython: env.VG_FREYA_PYTHON ?? join(homedir(), 'videogen-data/venvs/freya/bin/python'),
      modelsDir: env.VG_MODELS_DIR ?? join(homedir(), 'videogen-data/models'),
      hfHome: env.VG_HF_HOME ?? join(homedir(), 'videogen-data/models/hf'),
    },
    tiktok: {
      base: env.VG_TIKTOK_BASE ?? 'https://open.tiktokapis.com',
      pollMs: Number(env.VG_TIKTOK_POLL_MS ?? 10_000),
      ratePerMinute: Number(env.VG_TIKTOK_RATE_PER_MIN ?? 6),
      callbackPort: Number(env.VG_TIKTOK_CALLBACK_PORT ?? 3455),
    },
  };
}
