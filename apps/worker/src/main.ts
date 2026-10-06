import { assertNoPaidKeys, loadConfig } from '@videogen/shared';
import { appendAudit, createPool } from '@videogen/db';
import { CliAuthStatus, FixtureAuthStatus, refreshAuth } from './claude-account.ts';
import { findBundledClaude } from './claude-binary.ts';
import { listenCommands } from './commands.ts';
import { errorTag } from './errors.ts';
import { startHeartbeat } from './heartbeat.ts';
import { FixtureUsageSource, SdkUsageSource, startUsagePoller } from './usage.ts';

function die(stage: string, e: unknown): never {
  // Class/code only: raw messages can embed connection strings or CLI output.
  process.stderr.write(`worker: startup failed at ${stage} (${errorTag(e)})\n`);
  process.exit(1);
}

assertNoPaidKeys();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const authSrc = config.fixtures.claudeAuthStatus ? new FixtureAuthStatus(config.fixtures.claudeAuthStatus) : new CliAuthStatus(findBundledClaude());
const usageSrc = config.fixtures.usage ? new FixtureUsageSource(config.fixtures.usage) : new SdkUsageSource();

const audit = (action: string, data: Record<string, unknown>) => appendAudit(pool, { actorType: 'system', action, data }).catch(() => {});
const safeRefresh = () => refreshAuth(pool, authSrc).catch((e) => audit('claude.refresh_failed', { error: errorTag(e) }));

let authTimer: NodeJS.Timeout | undefined;
let stopUsage = () => {};
let stopHeartbeat = () => {};
let stopCommands = async () => {};
try {
  await appendAudit(pool, { actorType: 'system', action: 'worker.started', data: { pid: process.pid, usagePollMs: config.usagePollMs } });
  await refreshAuth(pool, authSrc);
  authTimer = setInterval(() => { void safeRefresh(); }, 60_000);
  stopUsage = startUsagePoller(pool, usageSrc, config.usagePollMs);
  stopHeartbeat = startHeartbeat(pool);
  stopCommands = await listenCommands(
    config.databaseUrl,
    { 'claude.refresh': () => safeRefresh() },
    { onFailure: (f) => { void audit('command.failed', { reason: f.reason, ...(f.type ? { type: f.type } : {}), ...(f.error ? { error: f.error } : {}) }); } },
  );
} catch (e) {
  die('init', e);
}

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(authTimer);
  stopUsage();
  stopHeartbeat();
  await stopCommands().catch(() => {});
  await audit('worker.stopping', { pid: process.pid });
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
