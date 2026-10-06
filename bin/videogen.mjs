#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { register } from 'tsx/esm/api';

const ROOT = resolve(import.meta.dirname, '..');

// 1. Paid-key guard: single source of truth is @videogen/shared (never a hand-copied list).
register();
const { findPaidKeys } = await import('../packages/shared/src/paid-key-guard.ts');
const found = findPaidKeys(process.env);
if (found.length) {
  console.error(`[videogen] Ücretli API anahtarı bulundu, başlatma reddedildi: ${found.join(', ')}`);
  process.exit(1);
}

const DATA = process.env.VG_DATA_DIR ?? join(homedir(), 'videogen-data');
const LOGS = join(DATA, 'logs');
const PORT = Number(process.env.VG_PORT ?? 5180);

// 2. Port probe before any side effect: a second launcher (or foreign process) must not crash-loop an API
// and spawn a duplicate worker while the health check happily hits the other instance.
try {
  await new Promise((res, rej) => {
    createServer().once('error', rej).listen(PORT, '127.0.0.1', function () { this.close(res); });
  });
} catch (e) {
  if (e?.code === 'EADDRINUSE') {
    console.error(`[videogen] 127.0.0.1:${PORT} dolu (başka bir VideoGen çalışıyor olabilir)`);
  } else {
    console.error(`[videogen] 127.0.0.1:${PORT} denenemedi (${e?.code ?? 'bilinmeyen hata'})`);
  }
  process.exit(1);
}

mkdirSync(LOGS, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    const why = r.error ? r.error.message : r.signal ? `sinyal ${r.signal}` : `çıkış kodu ${r.status}`;
    console.error(`[videogen] başarısız: ${cmd} ${args.join(' ')} (${why})`);
    if (cmd === 'docker') console.error('[videogen] ipucu: docker kurulu ve çalışıyor mu? 127.0.0.1:5433 portu boş mu?');
    process.exit(r.status ?? 1);
  }
}

run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
run('npx', ['tsx', 'packages/db/src/migrate-cli.ts']);
// Always build, and BEFORE the API starts: @fastify/static only serves files present at API start.
// (Unconditional: an mtime heuristic missed changes outside apps/web/src such as shared packages or config.)
run('npm', ['run', 'build']);

const children = new Map();
const timers = new Set();
const failures = new Map();
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const t of timers) clearTimeout(t);
  timers.clear();
  for (const c of children.values()) c.kill('SIGTERM');
  setTimeout(() => {
    for (const c of children.values()) c.kill('SIGKILL');
    process.exit(0);
  }, 10_000).unref();
  const check = setInterval(() => { if (children.size === 0) { clearInterval(check); process.exit(0); } }, 200);
  if (children.size === 0) process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Safety net: an uncaught exception in the supervisor must not orphan the children.
process.on('exit', () => { for (const c of children.values()) c.kill('SIGKILL'); });

function start(name, entry) {
  const logPath = join(LOGS, `${name}.log`);
  const log = createWriteStream(logPath, { flags: 'a' });
  // A log write failure (disk full, permissions) must not crash the supervisor and orphan the children.
  log.on('error', (e) => console.error(`[videogen] ${name} log yazılamadı (${e.code ?? e.name}): ${logPath}`));
  const child = spawn(process.execPath, ['--import', 'tsx', entry], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const startedAt = Date.now();
  let handled = false;
  // Cleanup runs on 'close' (stdio drained), not 'exit': ending the log earlier races with pending pipe writes.
  const onGone = (code, signal) => {
    if (handled) return;
    handled = true;
    log.end(() => {
      children.delete(name);
      afterGone(code, signal);
    });
  };
  const afterGone = (code, signal) => {
    if (stopping) return;
    // Crashes within 10 s of start escalate the backoff (2,4,8,...,30 s); a long-lived child restarts after 1 s.
    const fast = Date.now() - startedAt < 10_000;
    const n = fast ? (failures.get(name) ?? 0) + 1 : 0;
    failures.set(name, n);
    const delay = Math.min(30_000, 1000 * 2 ** n);
    console.error(`[videogen] ${name} çıktı (code=${code} signal=${signal}); ${Math.round(delay / 1000)} sn sonra yeniden başlatılıyor. Log: ${logPath}`);
    const t = setTimeout(() => { timers.delete(t); if (!stopping) start(name, entry); }, delay);
    timers.add(t);
  };
  child.on('close', onGone);
  child.on('error', (e) => onGone(`spawn-error:${e.code ?? 'unknown'}`, null));
  children.set(name, child);
}

start('api', 'apps/api/src/main.ts');
start('worker', 'apps/worker/src/main.ts');

async function waitHealthy() {
  for (let i = 0; i < 60 && !stopping; i++) {
    if (!children.has('api')) return false; // api child already gone: don't ask a possibly foreign instance
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (await waitHealthy()) {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`[videogen] hazır: ${url}`);
  if (process.env.VG_NO_BROWSER !== '1') {
    const opener = spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
    opener.on('error', () => console.log(`[videogen] tarayıcı açılamadı, adresi elle açın: ${url}`));
    opener.unref();
  }
} else if (!stopping) {
  console.error(`[videogen] API sağlıklı olmadı (çıktı veya 30 sn doldu); denetim sürüyor. Log: ${join(LOGS, 'api.log')}`);
}
