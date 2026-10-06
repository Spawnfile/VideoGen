/** GPU and heavy-CPU work in one process (single-worker invariant, spec §14): FIFO, one holder per resource (spec §5.1, K22). */
export type LockedResource = 'gpu' | 'heavy_cpu';

interface Waiter { owner: string; grant: () => void; fail: (e: Error) => void; onQueue?: (position: number) => void }

export class AbortedError extends Error {
  constructor() { super('aborted'); this.name = 'AbortError'; }
}

export class ResourceLocks {
  private holders = new Map<LockedResource, string>();
  private queues = new Map<LockedResource, Waiter[]>();

  holder(r: LockedResource): string | null { return this.holders.get(r) ?? null; }
  busy(r: LockedResource): boolean { return this.holders.has(r); }
  waiting(r: LockedResource): number { return this.queues.get(r)?.length ?? 0; }

  /** Resolves with an idempotent release once `owner` holds `r`; `onQueue(position)` (1 = next) while waiting. */
  acquire(r: LockedResource, owner: string, o: { signal?: AbortSignal; onQueue?: (position: number) => void } = {}): Promise<() => void> {
    if (o.signal?.aborted) return Promise.reject(new AbortedError());
    const release = this.releaser(r, owner);
    if (!this.holders.has(r)) {
      this.holders.set(r, owner);
      return Promise.resolve(release);
    }
    return new Promise((resolve, reject) => {
      const q = this.queues.get(r) ?? [];
      this.queues.set(r, q);
      const w: Waiter = {
        owner,
        grant: () => { o.signal?.removeEventListener('abort', onAbort); resolve(release); },
        fail: reject,
        onQueue: o.onQueue,
      };
      const onAbort = () => {
        const i = q.indexOf(w);
        if (i >= 0) { q.splice(i, 1); this.announce(r); }
        reject(new AbortedError());
      };
      o.signal?.addEventListener('abort', onAbort, { once: true });
      q.push(w);
      w.onQueue?.(q.length);
    });
  }

  private releaser(r: LockedResource, owner: string): () => void {
    let done = false;
    return () => {
      if (done || this.holders.get(r) !== owner) return;
      done = true;
      const next = this.queues.get(r)?.shift();
      if (next) {
        this.holders.set(r, next.owner);
        next.grant();
        this.announce(r);
      } else {
        this.holders.delete(r);
      }
    };
  }

  private announce(r: LockedResource): void {
    (this.queues.get(r) ?? []).forEach((w, i) => w.onQueue?.(i + 1));
  }
}
