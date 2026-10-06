import { AsyncQueue } from './async-queue.ts';
import type { ClaudeDriver, DriverSession, FakeScript, ProcSample, SessionSpec } from './driver.ts';
import { loadFixture } from './fixtures.ts';
import type { Msg } from './messages.ts';

export interface FakeOptions {
  /** Multiplier for recorded gaps (0 = as fast as possible). */
  speed?: number;
  /** Cap for one scaled gap, ms. */
  maxGapMs?: number;
  dir?: string;
  /** Scenario per user turn. Default: the spec's fakeScript on turn 0, `basic` afterwards. */
  pick?: (spec: SessionSpec, turn: number, text: string) => FakeScript;
}

const ABORT_MESSAGE = 'Claude Code returned an error result: [ede_diagnostic] result_type=user (fake interrupt)';

function interruptTail(dir?: string): Msg[] {
  const lines = loadFixture('interrupt', dir);
  const k = lines.findIndex((l) => l.m.type === 'user' && JSON.stringify(l.m).includes('[Request interrupted by user]'));
  return lines.slice(k).map((l) => l.m);
}

class FakeSession implements DriverSession {
  readonly pid = null;
  readonly messages: AsyncIterable<Msg>;
  private inputs = new AsyncQueue<string>();
  private inTurn = false;
  private interrupted = false;
  private killed: string | null = null;
  private wakers = new Set<() => void>();
  private stall: { since: number; cfg: NonNullable<FakeScript['stall']> } | null = null;

  constructor(private readonly spec: SessionSpec, private readonly o: Required<Omit<FakeOptions, 'dir'>> & { dir?: string }) {
    this.inputs.push(spec.prompt);
    this.messages = this.play();
  }

  send(text: string): void { this.inputs.push(text); }
  endInput(): void { this.inputs.end(); this.wake(); }
  async interrupt(): Promise<void> { if (this.inTurn) { this.interrupted = true; this.wake(); } }
  kill(signal: 'SIGTERM' | 'SIGKILL'): void { this.killed = signal; this.inputs.end(); this.wake(); }

  async sample(): Promise<ProcSample> {
    let cpuPct = 8;
    if (this.stall) {
      const { since, cfg } = this.stall;
      cpuPct = cfg.zeroCpuAfterMs !== undefined && Date.now() - since >= cfg.zeroCpuAfterMs ? 0 : (cfg.cpuPct ?? 8);
    }
    return { cpuPct, rssMb: 290, procs: 1 };
  }

  private wake(): void {
    const ws = [...this.wakers];
    this.wakers.clear();
    for (const w of ws) w();
  }

  private sleep(ms: number): Promise<void> {
    // An interrupt/kill that arrived while the consumer held a yielded message has no waiter to wake: don't start sleeping.
    if (ms <= 0 || this.interrupted || this.killed) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(h); this.wakers.delete(done); resolve(); };
      const h = setTimeout(done, Math.max(0, ms));
      this.wakers.add(done);
    });
  }

  private async *abortIfNeeded(): AsyncGenerator<Msg> {
    if (this.killed) throw new Error(`Claude Code process terminated by signal ${this.killed}`);
    if (this.interrupted) {
      yield* interruptTail(this.o.dir);
      // Streaming input (verified against the real CLI): after the aborted result the CLI waits for more input; the
      // iterator throws once the input is closed (or the process is killed).
      while (!this.inputs.ended && !this.killed) await new Promise<void>((r) => { this.wakers.add(r); });
      throw new Error(ABORT_MESSAGE);
    }
  }

  private async *play(): AsyncGenerator<Msg> {
    let turn = 0;
    for await (const text of this.inputs) {
      const script = this.o.pick(this.spec, turn++, text);
      const lines = loadFixture(script.fixture, this.o.dir);
      this.inTurn = true;
      let prev = lines[0]?.t ?? 0;
      for (let i = 0; i < lines.length; i++) {
        await this.sleep(Math.min((lines[i]!.t - prev) * this.o.speed, this.o.maxGapMs));
        prev = lines[i]!.t;
        yield* this.abortIfNeeded();
        const m = lines[i]!.m;
        yield script.structured !== undefined && m.type === 'result' ? { ...m, structured_output: script.structured } : m;
        for (const x of script.inject ?? []) if (x.afterIndex === i) yield x.m;
        if (script.failAfter?.index === i) throw new Error(script.failAfter.error);
        if (script.stall?.afterIndex === i) {
          this.stall = { since: Date.now(), cfg: script.stall };
          await this.sleep(script.stall.ms);
          this.stall = null;
          yield* this.abortIfNeeded();
        }
      }
      this.inTurn = false;
      this.interrupted = false;
    }
    if (this.killed) throw new Error(`Claude Code process terminated by signal ${this.killed}`);
  }
}

/** Replays recorded real stream-json sessions (tests/fixtures/claude-streams) with accelerated timing. */
export class FakeClaudeDriver implements ClaudeDriver {
  readonly kind = 'fake' as const;
  private readonly o: Required<Omit<FakeOptions, 'dir'>> & { dir?: string };

  constructor(o: FakeOptions = {}) {
    this.o = {
      speed: o.speed ?? 0.02,
      maxGapMs: o.maxGapMs ?? 250,
      dir: o.dir,
      pick: o.pick ?? ((spec, turn) => (turn === 0 && spec.fakeScript ? spec.fakeScript : { fixture: 'basic' })),
    };
  }

  start(spec: SessionSpec): DriverSession {
    return new FakeSession(spec, this.o);
  }
}
