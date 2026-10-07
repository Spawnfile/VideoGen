import { homedir } from 'node:os';
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
import { fakePipelineScript } from './pipeline/fake-scripts.ts';
import { Orchestrator } from './pipeline/orchestrator.ts';
import { SystemProbe } from './pipeline/resources.ts';
import { FakeAudioDriver, PythonAudioDriver, type AudioDriver } from './audio/driver.ts';
import { runPreflight } from './pipeline/preflight.ts';
import { BlenderRenderDriver, FakeRenderDriver, type Capability, type RenderDriver } from './render/driver.ts';
import { ResourceLocks } from './render/locks.ts';
import { ReviewTargets, reviewToolHost, toolHosts } from './pipeline/review-tools.ts';
import { sceneToolHost } from './pipeline/scene-tools.ts';
import { ARTIFACT_VALIDATOR, pipelineExecutors } from './pipeline/steps.ts';
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
// M4b: the only owner of Blender/ffmpeg work (K22); one in-process lock per GPU and heavy CPU (single-worker invariant, §14).
const renderAudit = (action: string, data: Record<string, unknown>) => appendAudit(pool, { actorType: 'orchestrator', action, data }).then(() => {}, () => {});
const render: RenderDriver = config.render.driver === 'fake'
  ? new FakeRenderDriver({ ffmpeg: config.render.ffmpeg })
  : new BlenderRenderDriver({ blender: config.render.blender, bwrap: config.render.bwrap, dataDir: config.dataDir, home: homedir(), audit: renderAudit });
// M5c: the voice CLI child (K22: only under the orchestrator's GPU lock); the fake render driver comes with the fake TTS.
const audio: AudioDriver = config.render.driver === 'fake'
  ? new FakeAudioDriver({ ffmpeg: config.render.ffmpeg })
  : new PythonAudioDriver({ ...config.audio, dataDir: config.dataDir, audit: renderAudit });
const locks = new ResourceLocks();
const probe = new SystemProbe(config.dataDir);
let renderCapability: Capability = { ok: false, reason: 'denetlenmedi' };
/** M4c: the draft under review per draft_review step (extract_frames reads it; plan C22). */
const reviews = new ReviewTargets();
const manager = new SessionManager({
  pool, dataDir: config.dataDir, driver, pluginDir: PLUGIN_DIR, gate: guard, sdkVersion: sdkVersion(), chatIdleMs: config.chatIdleMs,
  quietAfterMs: config.liveness.quietAfterMs, stuckAfterMs: config.liveness.stuckAfterMs,
  archive: (s) => archiveTranscript({ pool, dataDir: config.dataDir, ...s }),
  validator: ARTIFACT_VALIDATOR,
  tools: toolHosts(
    sceneToolHost({ pool, render, locks, probe, ffmpeg: config.render.ffmpeg, encodePreset: config.render.encodePreset, capability: () => renderCapability }),
    reviewToolHost({ ffmpeg: config.render.ffmpeg, targets: reviews }),
  ),
});
const orchestrator = new Orchestrator({
  pool, dataDir: config.dataDir, probe, locks, gate: guard, preflight: runPreflight({ pool, audio, dataDir: config.dataDir }),
  executors: pipelineExecutors({
    pool, dataDir: config.dataDir, manager, fakeScript: driver.kind === 'fake' ? fakePipelineScript : undefined, reviews, gate: guard,
    scene: { pool, render, locks, probe, ffmpeg: config.render.ffmpeg, encodePreset: config.render.encodePreset, capability: () => renderCapability },
  }),
});
const chat = new ChatService({ pool, manager });
chat.bind();
guard.onClear(() => { void chat.resumeWaiting(); void orchestrator.startQueued(); });

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
  // Never fatal: chat and research still work; build steps fail with this reason (plan B3: no unsandboxed fallback).
  renderCapability = await render.capabilities();
  await appendAudit(pool, { actorType: 'system', action: 'render.capabilities', data: { driver: render.kind, ...renderCapability } });
  if (!renderCapability.ok) process.stderr.write(`worker: render unavailable (${renderCapability.reason})\n`);
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
      'run.start': (c) => orchestrator.startRun(uuidOf(c, 'runId')),
      'run.cancel': (c) => orchestrator.cancel(uuidOf(c, 'runId')),
      'roles.changed': async () => { manager.setRoleOverrides(await loadRoleOverrides(pool)); },
      ...(config.devEndpoints ? {
        'dev.session.start': (c: Record<string, unknown>) => manager.start({ kind: 'pipeline', role: roleOf(c.role), prompt: typeof c.prompt === 'string' ? c.prompt.slice(0, 2000) : 'Merhaba', fakeScript: (c.script ?? undefined) as FakeScript | undefined }),
      } : {}),
    },
    { onFailure: (f) => { void audit('command.failed', { reason: f.reason, ...(f.type ? { type: f.type } : {}), ...(f.error ? { error: f.error } : {}) }); } },
  );
  await chat.recover();
  await guard.restore(); // before recover(): queued runs must see the stored §6.4 block, not the fresh default (final review I1)
  await orchestrator.recover();
  orchestrator.start();
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
  orchestrator.stop();
  await stopCommands().catch(() => {});
  await manager.stop().catch(() => {});
  await audit('worker.stopping', { pid: process.pid });
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
watchParent(() => { process.stderr.write('worker: parent process gone; shutting down\n'); void shutdown(); });
