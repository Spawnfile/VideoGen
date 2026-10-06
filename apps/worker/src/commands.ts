import pg from 'pg';
import { errorTag } from './errors.ts';

export interface CommandFailure {
  reason: 'malformed' | 'unknown' | 'handler';
  /** Only set for known handlers (never echoes untrusted payload text). */
  type?: string;
  error?: string;
}
export interface ListenOptions {
  onFailure?: (f: CommandFailure) => void;
  /** The LISTEN connection died unexpectedly. Default: crash-only (the supervisor restarts the worker). */
  onConnectionLost?: (reason: string) => void;
}

function crash(reason: string): void {
  process.stderr.write(`worker: vg_commands connection lost (${reason}); exiting for supervisor restart\n`);
  process.exit(1);
}

export async function listenCommands(
  url: string,
  handlers: Record<string, () => Promise<unknown>>,
  opts: ListenOptions = {},
): Promise<() => Promise<void>> {
  const onFailure = opts.onFailure ?? (() => {});
  const onLost = opts.onConnectionLost ?? crash;
  const c = new pg.Client({ connectionString: url });
  let stopping = false;
  c.on('error', (e) => { if (!stopping) onLost(errorTag(e)); });
  c.on('end', () => { if (!stopping) onLost('connection ended'); });
  c.on('notification', (n) => {
    if (n.channel !== 'vg_commands' || !n.payload) return;
    let type: unknown;
    try { type = (JSON.parse(n.payload) as { type?: unknown } | null)?.type; } catch { type = undefined; }
    if (typeof type !== 'string') { onFailure({ reason: 'malformed' }); return; }
    if (!Object.hasOwn(handlers, type)) { onFailure({ reason: 'unknown' }); return; }
    // Promise.resolve().then so a synchronous throw from the handler is caught too.
    Promise.resolve().then(() => handlers[type]!()).catch((e) => {
      try { onFailure({ reason: 'handler', type, error: errorTag(e) }); } catch { /* reporting must never crash the worker */ }
    });
  });
  await c.connect();
  await c.query('LISTEN vg_commands');
  return async () => { stopping = true; await c.end(); };
}
