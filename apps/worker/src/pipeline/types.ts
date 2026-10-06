import type { AudioMode, ProgressSource, Resource, StepKey } from '@videogen/shared';

export interface StepContext {
  runId: string;
  stepId: string;
  key: StepKey;
  attempt: number;
  videoId: string;
  productId: string;
  productName: string;
  audioMode: AudioMode;
  versionId: string | null;
  /** ~/videogen-data/runs/<runId> */
  runDir: string;
  /** Aborted when the run is cancelled. */
  signal: AbortSignal;
  /** Monotone per step (0..99); `agent`/`render` take over from `time`. */
  progress(percent: number, source: ProgressSource): void;
  status(s: 'running' | 'waiting_limit' | 'waiting_gpu' | 'waiting_disk', note?: string | null): void;
  /** Links the step to its current agent session (the card and the trace in the UI). */
  session(sessionId: string): void;
}

export type StepOutcome =
  | { status: 'done'; note?: string }
  | { status: 'needs_human'; reason: string }
  | { status: 'failed'; error: string; retry?: boolean }
  | { status: 'cancelled' };

export interface StepExecutor {
  key: StepKey;
  resource: Resource;
  inputHash(ctx: StepContext): Promise<string>;
  /** Spec §14 idempotency: true when a valid output for this input already exists. */
  reuse?(ctx: StepContext, inputHash: string): Promise<boolean>;
  run(ctx: StepContext, inputHash: string): Promise<StepOutcome>;
}
