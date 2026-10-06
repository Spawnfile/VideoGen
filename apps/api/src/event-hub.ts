import pg from 'pg';
import { maxEventId, readEventsAfter } from '@videogen/db';

export type SseMessage = { id?: number; event: 'ui' | 'live'; data: unknown };

/** One LISTEN connection for the whole API; fans durable (ui) and ephemeral (live) events out to SSE clients. */
export class EventHub {
  private subs = new Set<(m: SseMessage) => void>();
  private lastId = 0;
  private client: pg.Client | null = null;
  private chain: Promise<void> = Promise.resolve();
  private stopping = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly url: string,
    private readonly log: (msg: string, err?: unknown) => void = (msg, err) => console.error(`[event-hub] ${msg}`, err ?? ''),
  ) {}

  async start(): Promise<void> {
    this.lastId = await maxEventId(this.pool);
    await this.connect();
    this.pump(); // anything committed between maxEventId() and LISTEN
  }

  private async connect(): Promise<void> {
    const c = new pg.Client({ connectionString: this.url });
    c.on('notification', (n) => {
      if (n.channel === 'vg_events') this.pump();
      else if (n.channel === 'vg_live' && n.payload) {
        try {
          this.emit({ event: 'live', data: JSON.parse(n.payload) });
        } catch (err) {
          this.log('dropping malformed vg_live payload', err);
        }
      }
    });
    const lost = () => { if (this.client === c) { this.client = null; this.scheduleReconnect(); } };
    c.on('error', lost);
    c.on('end', lost);
    await c.connect();
    await c.query('LISTEN vg_events');
    await c.query('LISTEN vg_live');
    if (this.stopping) {
      await c.end().catch(() => {});
      return;
    }
    this.client = c;
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopping) return;
      this.connect().then(() => this.pump(), () => this.scheduleReconnect());
    }, 1000);
  }

  private pump(): void {
    this.chain = this.chain
      .then(async () => {
        for (;;) {
          const rows = await readEventsAfter(this.pool, this.lastId, 500);
          if (!rows.length) return;
          for (const r of rows) {
            this.lastId = r.id;
            this.emit({ id: r.id, event: 'ui', data: r });
          }
        }
      })
      .catch((err) => this.log('pump failed; events will be delivered on the next notification or replay', err));
  }

  private emit(m: SseMessage): void {
    for (const s of this.subs) s(m);
  }

  subscribe(fn: (m: SseMessage) => void): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const c = this.client;
    this.client = null;
    await c?.end();
  }
}
