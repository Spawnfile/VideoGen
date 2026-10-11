import { readFileSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { appendAudit, markOrphanSessions } from '@videogen/db';
import { groupAlive, killGroup } from '@videogen/claude';

const dirOf = (dataDir: string) => join(dataDir, 'pids');

export type PidKind = 'claude' | 'render';

/** `owner`: the agent session id (claude) or the render job owner (render: Blender/bwrap/ffmpeg groups, plan B16). */
export async function writePidFile(dataDir: string, pid: number, owner: string, kind: PidKind = 'claude'): Promise<void> {
  await mkdir(dirOf(dataDir), { recursive: true });
  await writeFile(join(dirOf(dataDir), `${pid}.json`), JSON.stringify({ pid, sessionId: owner, kind, at: new Date().toISOString() }));
}

export async function removePidFile(dataDir: string, pid: number): Promise<void> {
  await rm(join(dirOf(dataDir), `${pid}.json`), { force: true });
}

const LEADER: Record<PidKind, RegExp> = { claude: /claude/, render: /bwrap|blender|ffmpeg|chrome|render-cli/ };

/** The pid may have been reused by an unrelated process: only a leader that still looks like the recorded kind is killed. */
function cmdlineMatches(pid: number, kind: PidKind): boolean {
  try { return LEADER[kind].test(readFileSync(`/proc/${pid}/cmdline`, 'utf8')); } catch { return false; }
}

function kindOf(dataDir: string, file: string): PidKind {
  try { return JSON.parse(readFileSync(join(dirOf(dataDir), file), 'utf8')).kind === 'render' ? 'render' : 'claude'; } catch { return 'claude'; }
}

/** Spec §14: process groups left behind by a dead worker (Claude CLIs and render jobs) are killed. */
export async function reapOrphans(dataDir: string, matches: (pid: number, kind: PidKind) => boolean = cmdlineMatches): Promise<number[]> {
  const killed: number[] = [];
  for (const f of await readdir(dirOf(dataDir)).catch(() => [] as string[])) {
    const pid = Number(/^(\d+)\.json$/.exec(f)?.[1]);
    if (!pid) continue;
    if (groupAlive(pid) && matches(pid, kindOf(dataDir, f)) && killGroup(pid, 'SIGKILL')) killed.push(pid);
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
