import { describe, expect, it } from 'vitest';
import type { AgentSessionView } from '@videogen/shared/browser';
import { cardMeta, cardStatusLabel, isLiveStatus } from '../src/lib/agent-view.ts';

const s = (status: AgentSessionView['status'], tokens = 41_234): AgentSessionView => ({
  id: 's', kind: 'pipeline', role: 'builder', model: 'opus', effort: 'high', status, claudeSessionId: 's', parentSessionId: null, threadId: null, runId: null, stepId: null,
  progress: null, progressSource: null, progressMessage: null, tokens, costUsd: null, numTurns: 0, terminalReason: null, error: null, waitingUntil: null,
  createdAt: '2026-10-06T10:00:00.000Z', startedAt: '2026-10-06T10:00:00.000Z', endedAt: null, lastEventAt: null,
});
const sample = (liveness: 'active' | 'quiet_alive' | 'maybe_stuck', silentMs: number, receivedAt: number) => ({ sessionId: 's', cpuPct: 38.4, rssMb: 290, silentMs, liveness, receivedAt });

describe('agent card meta', () => {
  it('live session: age grows since the sample arrived; quiet but alive and stuck come from the worker sample', () => {
    expect(cardMeta(s('tool'), sample('active', 1_000, 10_000), 11_500)).toMatchObject({ ago: '3 sn önce', alive: false, stuck: false, cpu: 'CPU %38', ram: '290 MB', tokens: '41K token' });
    expect(cardMeta(s('thinking'), sample('quiet_alive', 12_000, 0), 0)).toMatchObject({ alive: true, stuck: false });
    expect(cardMeta(s('thinking'), sample('maybe_stuck', 130_000, 0), 0)).toMatchObject({ stuck: true });
  });

  it('an ended session ignores its last sample and shows no liveness', () => {
    expect(cardMeta(s('cancelled'), sample('maybe_stuck', 130_000, 0), 0)).toMatchObject({ ago: null, alive: false, stuck: false, cpu: null, ram: null, tokens: '41K token' });
    expect(isLiveStatus('idle')).toBe(true);
    expect(isLiveStatus('queued')).toBe(false);
    expect(isLiveStatus('done')).toBe(false);
  });

  it('labels the GPU queue position or the pre-check reason, and the limit reset time (spec §12.2)', () => {
    expect(cardStatusLabel(s('waiting_gpu'))).toBe('GPU bekliyor');
    expect(cardStatusLabel(s('waiting_gpu'), { sessionId: 's', position: 2, reason: null })).toBe('GPU bekliyor · sırada 2');
    expect(cardStatusLabel(s('waiting_gpu'), { sessionId: 's', position: null, reason: 'swap %95 ≥ %90' })).toBe('GPU bekliyor · swap %95 ≥ %90');
    expect(cardStatusLabel({ ...s('waiting_limit'), waitingUntil: '2026-10-06T11:00:00.000Z' })).toMatch(/^limit bekleniyor \(\d{2}:\d{2}\)$/);
    expect(cardStatusLabel(s('tool'))).toBe('araç çalıştırıyor');
  });
});
