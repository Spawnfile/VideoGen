import { assertNoPaidKeys, cleanChildEnv, loadConfig, ROLE_NAMES, watchParent, type RoleName } from '@videogen/shared';
import { appendAudit, createPool, isUuid } from '@videogen/db';
import { FakeClaudeDriver, PLUGIN_DIR, SdkClaudeDriver, type ClaudeDriver, type FakeScript } from '@videogen/claude';
import { ChatService } from './agents/chat.ts';
import { fakePicker } from './agents/fake-picker.ts';
import { SessionManager } from './agents/manager.ts';
import { recoverOnStartup } from './agents/pids.ts';
import { loadRoleOverrides } from './agents/role-settings.ts';
import { archiveTranscript } from './agents/transcripts.ts';
import { UsageGuard } from './agents/usage-guard.ts';
import { CliAuthStatus, FixtureAuthStatus, refreshAuth } from './claude-account.ts';
import { findBundledClaude, sdkVersion } from './claude-binary.ts';
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
const driver: ClaudeDriver = config.claudeDriver === 'fake'
  ? new FakeClaudeDriver({ speed: Number(process.env.VG_FAKE_SPEED ?? 0.05), pick: fakePicker(process.env.VG_FAKE_CHAT) })
  : new SdkClaudeDriver({ pluginDir: PLUGIN_DIR, claudeBinary: findBundledClaude(), env: cleanChildEnv(), onStderr: (l) => process.stderr.write(`[claude] ${l.slice(0, 500)}\n`) });
const guard = new UsageGuard({ pool });
const manager = new SessionManager({
  pool, dataDir: config.dataDir, driver, pluginDir: PLUGIN_DIR, gate: guard, sdkVersion: sdkVersion(), chatIdleMs: config.chatIdleMs,
  quietAfterMs: config.liveness.quietAfterMs, stuckAfterMs: config.liveness.stuckAfterMs,
  archive: (s) => archiveTranscript({ pool, dataDir: config.dataDir, ...s }),
});
const chat = new ChatService({ pool, manager });
chat.bind();
guard.onClear(() => { void chat.resumeWaiting(); });

const audit = (action: string, data: Record<string, unknown>) => appendAudit(pool, { actorType: 'system', action, data }).catch(() => {});
const safeRefresh = () => refreshAuth(pool, authSrc).catch((e) => audit('claude.refresh_failed', { error: errorTag(e) }));
const uuidOf = (c: Record<string, unknown>, k: string): string => {
  const v = c[k];
  if (typeof v !== 'string' || !isUuid(v)) throw new TypeError(`invalid ${k}`);
  return v;
};
const roleOf = (v: unknown): RoleName => {
  if (typeof v !== 'string' || !(ROLE_NAMES as readonly string[]).includes(v)) throw new TypeError('invalid role');
  return v as RoleName;
};

let authTimer: NodeJS.Timeout | undefined;
let stopUsage = () => {};
let stopHeartbeat = () => {};
let stopCommands = async () => {};
try {
  await appendAudit(pool, { actorType: 'system', action: 'worker.started', data: { pid: process.pid, usagePollMs: config.usagePollMs, driver: driver.kind } });
  await recoverOnStartup(pool, config.dataDir);
  manager.setRoleOverrides(await loadRoleOverrides(pool));
  await refreshAuth(pool, authSrc);
  authTimer = setInterval(() => { void safeRefresh(); }, 60_000);
  stopUsage = startUsagePoller(pool, usageSrc, config.usagePollMs, (s) => guard.update(s));
  stopHeartbeat = startHeartbeat(pool);
  stopCommands = await listenCommands(
    config.databaseUrl,
    {
      'claude.refresh': () => safeRefresh(),
      'chat.send': (c) => chat.handleSend(uuidOf(c, 'messageId')),
      'chat.interrupt': (c) => chat.interrupt(uuidOf(c, 'threadId')),
      'session.cancel': (c) => manager.cancel(uuidOf(c, 'sessionId')),
      'session.retry': (c) => manager.retry(uuidOf(c, 'sessionId'), 'user'),
      'roles.changed': async () => { manager.setRoleOverrides(await loadRoleOverrides(pool)); },
      ...(config.devEndpoints ? {
        'dev.session.start': (c: Record<string, unknown>) => manager.start({ kind: 'pipeline', role: roleOf(c.role), prompt: typeof c.prompt === 'string' ? c.prompt.slice(0, 2000) : 'Merhaba', fakeScript: (c.script ?? undefined) as FakeScript | undefined }),
      } : {}),
    },
    { onFailure: (f) => { void audit('command.failed', { reason: f.reason, ...(f.type ? { type: f.type } : {}), ...(f.error ? { error: f.error } : {}) }); } },
  );
  await chat.recover();
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
  guard.stop();
  await stopCommands().catch(() => {});
  await manager.stop().catch(() => {});
  await audit('worker.stopping', { pid: process.pid });
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
watchParent(() => { process.stderr.write('worker: parent process gone; shutting down\n'); void shutdown(); });
