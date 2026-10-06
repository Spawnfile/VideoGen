import { precheck, type Probe } from '../pipeline/resources.ts';
import { AbortedError, type LockedResource, type ResourceLocks } from './locks.ts';

export interface WaitInfo { position?: number; reason?: string; status?: 'waiting_gpu' | 'waiting_disk' }
export interface GateOptions {
  owner: string;
  signal?: AbortSignal;
  probe?: Probe;
  extraDiskMb?: number;
  /** Re-check interval while the spec §6.4 pre-check fails. */
  waitMs?: number;
  onWait?: (w: WaitInfo) => void;
  /** Called once when the lock is held and the pre-check passed. */
  onRun?: () => void;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new AbortedError());
  const t = setTimeout(() => { signal?.removeEventListener('abort', off); resolve(); }, ms);
  const off = () => { clearTimeout(t); reject(new AbortedError()); };
  signal?.addEventListener('abort', off, { once: true });
});

/** Holds the resource lock, waits for the spec §6.4 pre-check (GPU: RAM, swap, disk, VRAM, ollama; heavy CPU: disk), then runs `fn`. */
export async function withResource<T>(locks: ResourceLocks, r: LockedResource, o: GateOptions, fn: () => Promise<T>): Promise<T> {
  const release = await locks.acquire(r, o.owner, { signal: o.signal, onQueue: (position) => o.onWait?.({ position }) });
  try {
    if (o.probe) {
      for (;;) {
        const pc = precheck(r, await o.probe.snapshot(), o.extraDiskMb ?? 0);
        if (pc.ok) break;
        o.onWait?.({ reason: pc.reason, status: pc.status });
        await sleep(o.waitMs ?? 15_000, o.signal);
      }
    }
    o.onRun?.();
    return await fn();
  } finally {
    release();
  }
}
