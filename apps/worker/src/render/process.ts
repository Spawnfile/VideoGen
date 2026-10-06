import { spawn } from 'node:child_process';
import { GroupSampler, groupAlive, killGroup } from '@videogen/claude';
import { removePidFile, writePidFile } from '../agents/pids.ts';

export interface ProcOptions {
  cwd: string;
  /** Spawned as a process-group leader; recorded in <dataDir>/pids as kind "render" (orphans are reaped on worker start). */
  dataDir: string;
  owner: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs: number;
  /** RSS of the whole group; bubblewrap sets no memory limit (plan B3). */
  maxRssMb?: number;
  onLine?: (line: string) => void;
  sampleMs?: number;
  /** SIGTERM → this long → SIGKILL. */
  killGraceMs?: number;
}
export interface ProcResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stopped: 'timeout' | 'memory' | 'aborted' | null;
  ms: number;
  /** Last 40 lines of stdout+stderr (callers must not pass host paths on to agents). */
  tail: string[];
}

export function runProcess(file: string, args: string[], o: ProcOptions): Promise<ProcResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd: o.cwd, env: o.env ?? {}, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const pid = child.pid!;
    const tail: string[] = [];
    let stopped: ProcResult['stopped'] = null;
    let buf = '';
    const onData = (d: Buffer) => {
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        tail.push(line);
        if (tail.length > 40) tail.shift();
        o.onLine?.(line);
      }
    };
    child.stdout!.on('data', onData);
    child.stderr!.on('data', onData);
    const recorded = writePidFile(o.dataDir, pid, o.owner, 'render').catch(() => {});
    const stop = (why: NonNullable<ProcResult['stopped']>) => {
      if (stopped) return;
      stopped = why;
      killGroup(pid, 'SIGTERM');
      setTimeout(() => { if (groupAlive(pid)) killGroup(pid, 'SIGKILL'); }, o.killGraceMs ?? 5000).unref();
    };
    const timer = setTimeout(() => stop('timeout'), o.timeoutMs);
    const sampler = new GroupSampler(pid);
    const watch = o.maxRssMb ? setInterval(() => {
      void sampler.sample().then((s) => { if (s && s.rssMb > o.maxRssMb!) stop('memory'); }, () => {});
    }, o.sampleMs ?? 1000) : null;
    const onAbort = () => stop('aborted');
    if (o.signal?.aborted) onAbort();
    o.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (watch) clearInterval(watch);
      o.signal?.removeEventListener('abort', onAbort);
      if (buf) { tail.push(buf); o.onLine?.(buf); }
      // The leader is gone; kill whatever it left in the group, then forget the pid file (after it was written).
      if (groupAlive(pid)) killGroup(pid, 'SIGKILL');
      void recorded.then(() => removePidFile(o.dataDir, pid)).catch(() => {})
        .finally(() => resolve({ code, signal, stopped, ms: Date.now() - started, tail: tail.slice(-40) }));
    });
  });
}
