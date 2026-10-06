import type { AgentSessionView, GpuWait, SessionStatus } from '@videogen/shared/browser';
import type { SampleView } from './stores.ts';
import { formatAgo, formatTokens, STATUS_LABEL } from './trace-view.ts';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/** Spec §12.2: "limit bekleniyor (açılma saati)", "GPU bekliyor (sıradaki yeriyle)" or the pre-check reason. */
export function cardStatusLabel(session: AgentSessionView, gpu?: GpuWait): string {
  if (session.status === 'waiting_limit' && session.waitingUntil) return `${STATUS_LABEL.waiting_limit} (${clock(session.waitingUntil)})`;
  if (session.status === 'waiting_gpu' && gpu?.position) return `${STATUS_LABEL.waiting_gpu} · sırada ${gpu.position}`;
  if (session.status === 'waiting_gpu' && gpu?.reason) return `${STATUS_LABEL.waiting_gpu} · ${gpu.reason}`;
  return STATUS_LABEL[session.status];
}

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
