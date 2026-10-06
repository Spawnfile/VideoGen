import type { AgentSessionView, SessionStatus } from '@videogen/shared/browser';
import type { SampleView } from './stores.ts';
import { formatAgo, formatTokens } from './trace-view.ts';

const LIVE: readonly SessionStatus[] = ['starting', 'thinking', 'tool', 'idle'];
export const isLiveStatus = (s: SessionStatus): boolean => LIVE.includes(s);

export interface CardMeta { ago: string | null; alive: boolean; stuck: boolean; cpu: string | null; ram: string | null; tokens: string | null }

/** Worker samples arrive every 2 s with silentMs at sampling time; the age keeps growing between samples. */
export function cardMeta(session: AgentSessionView, sample: SampleView | undefined, now: number): CardMeta {
  const tokens = session.tokens ? `${formatTokens(session.tokens)} token` : null;
  if (!isLiveStatus(session.status) || !sample) return { ago: null, alive: false, stuck: false, cpu: null, ram: null, tokens };
  return {
    ago: formatAgo(sample.silentMs + Math.max(0, now - sample.receivedAt)),
    alive: sample.liveness === 'quiet_alive',
    stuck: sample.liveness === 'maybe_stuck',
    cpu: sample.cpuPct === null ? null : `CPU %${Math.round(sample.cpuPct)}`,
    ram: sample.rssMb === null ? null : `${sample.rssMb} MB`,
    tokens,
  };
}
