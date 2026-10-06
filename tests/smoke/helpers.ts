import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';

/** Fixed so specs can find pids.json; created and removed by stack.mjs. */
export const SMOKE_DIR = '/tmp/videogen-smoke';

export function readPids(): { api: number; worker: number } {
  return JSON.parse(readFileSync(join(SMOKE_DIR, 'pids.json'), 'utf8')) as { api: number; worker: number };
}

export function killHard(name: 'api' | 'worker'): number {
  const pid = readPids()[name];
  process.kill(pid, 'SIGKILL');
  return pid;
}

/** While SMOKE_DIR/hold-<name> exists the stack does not restart that child (lets S4 observe a dead worker). */
export function holdRestart(name: 'api' | 'worker'): void { writeFileSync(join(SMOKE_DIR, `hold-${name}`), ''); }
export function releaseRestart(name: 'api' | 'worker'): void { rmSync(join(SMOKE_DIR, `hold-${name}`), { force: true }); }

export async function waitForRestart(name: 'api' | 'worker', oldPid: number, ms = 15_000): Promise<number> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const pid = readPids()[name];
    if (pid !== oldPid) return pid;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${name} was not restarted within ${ms} ms`);
}

/** Fake-driver scenario: silent after line 3 with live CPU, then CPU drops to 0 (spec §12.3, smoke S3). */
export const STUCK_SCRIPT = { fixture: 'basic', stall: { afterIndex: 3, ms: 600_000, cpuPct: 25, zeroCpuAfterMs: 4_000 } };
/** A longer real recording (subagent + structured output) that keeps producing events for several seconds. */
export const SLOW_SCRIPT = { fixture: 'subagent' };

export async function startDevSession(request: APIRequestContext, body: { role: string; prompt?: string; script?: object }): Promise<void> {
  const r = await request.post('/api/dev/sessions', { data: body });
  if (r.status() !== 202) throw new Error(`dev session: ${r.status()}`);
}

export async function serverMaxEventId(request: APIRequestContext): Promise<number> {
  const r = await request.get('/api/usage');
  return Number(r.headers()['x-vg-event-id']);
}

export async function produceVia(request: APIRequestContext, productName: string, audioMode: 'vo' | 'silent'): Promise<{ videoId: string; runId: string }> {
  const r = await request.post('/api/videos', { data: { productName, audioMode } });
  if (r.status() !== 202) throw new Error(`produce: ${r.status()}`);
  return (await r.json()) as { videoId: string; runId: string };
}
