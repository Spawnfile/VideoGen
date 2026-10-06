import { readFileSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { appendAudit, markOrphanSessions } from '@videogen/db';
import { groupAlive, killGroup } from '@videogen/claude';

const dirOf = (dataDir: string) => join(dataDir, 'pids');

export async function writePidFile(dataDir: string, pid: number, sessionId: string): Promise<void> {
  await mkdir(dirOf(dataDir), { recursive: true });
  await writeFile(join(dirOf(dataDir), `${pid}.json`), JSON.stringify({ pid, sessionId, at: new Date().toISOString() }));
}

export async function removePidFile(dataDir: string, pid: number): Promise<void> {
  await rm(join(dirOf(dataDir), `${pid}.json`), { force: true });
}

function cmdlineHasClaude(pid: number): boolean {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('claude'); } catch { return false; }
}

/** Spec §14: process groups left behind by a dead worker are killed (only if the leader still looks like a Claude CLI). */
export async function reapOrphans(dataDir: string, isClaude: (pid: number) => boolean = cmdlineHasClaude): Promise<number[]> {
  const killed: number[] = [];
  for (const f of await readdir(dirOf(dataDir)).catch(() => [] as string[])) {
    const pid = Number(/^(\d+)\.json$/.exec(f)?.[1]);
    if (!pid) continue;
    if (groupAlive(pid) && isClaude(pid) && killGroup(pid, 'SIGKILL')) killed.push(pid);
    await rm(join(dirOf(dataDir), f), { force: true });
  }
  return killed;
}

export async function recoverOnStartup(pool: pg.Pool, dataDir: string): Promise<{ killed: number[]; orphaned: string[] }> {
  const killed = await reapOrphans(dataDir);
  const orphaned = await markOrphanSessions(pool);
  if (killed.length) await appendAudit(pool, { actorType: 'system', action: 'agent.process.reaped', data: { pids: killed } });
  for (const id of orphaned) await appendAudit(pool, { actorType: 'system', action: 'agent.session.orphaned', sessionId: id, data: { reason: 'worker_restart' } });
  return { killed, orphaned };
}
