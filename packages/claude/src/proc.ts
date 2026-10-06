import { readdirSync, readFileSync } from 'node:fs';
import type { ProcSample } from './driver.ts';

const CLK_TCK = 100;
const PAGE = 4096;

/** Fields after the `(comm)` part of /proc/<pid>/stat: [state, ppid, pgrp, …, utime(11), stime(12), …]. */
function statFields(pid: number, procDir: string): string[] | null {
  try {
    const s = readFileSync(`${procDir}/${pid}/stat`, 'utf8');
    return s.slice(s.lastIndexOf(')') + 2).split(' ');
  } catch {
    return null;
  }
}

export function readGroupPids(pgid: number, procDir = '/proc'): number[] {
  const out: number[] = [];
  for (const name of readdirSync(procDir)) {
    if (!/^\d+$/.test(name)) continue;
    const f = statFields(Number(name), procDir);
    if (f && Number(f[2]) === pgid) out.push(Number(name));
  }
  return out;
}

export function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}

export function killGroup(pgid: number, signal: NodeJS.Signals): boolean {
  try { process.kill(-pgid, signal); return true; } catch { return false; }
}

export function memAvailableMb(): number {
  const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync('/proc/meminfo', 'utf8'));
  return m ? Math.round(Number(m[1]) / 1024) : 0;
}

/** CPU% (of one core) and RSS of every process in a group, from /proc deltas between calls. */
export class GroupSampler {
  private last: { ticks: number; at: number } | null = null;
  constructor(private readonly pgid: number, private readonly procDir = '/proc') {}

  async sample(): Promise<ProcSample | null> {
    const pids = readGroupPids(this.pgid, this.procDir);
    if (!pids.length) return null;
    let ticks = 0;
    let pages = 0;
    for (const pid of pids) {
      const f = statFields(pid, this.procDir);
      if (f) ticks += Number(f[11]) + Number(f[12]);
      try { pages += Number(readFileSync(`${this.procDir}/${pid}/statm`, 'utf8').split(' ')[1]); } catch { /* exited */ }
    }
    const now = Date.now();
    const cpuPct = this.last && now > this.last.at ? Math.max(0, ((ticks - this.last.ticks) / CLK_TCK / ((now - this.last.at) / 1000)) * 100) : 0;
    this.last = { ticks, at: now };
    return { cpuPct: Math.round(cpuPct * 10) / 10, rssMb: Math.round((pages * PAGE) / 1048576), procs: pids.length };
  }
}
