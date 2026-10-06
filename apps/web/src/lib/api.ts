import { useQuery } from '@tanstack/react-query';
import type { ClaudeAuth, UsageSnapshot } from '@videogen/shared/browser';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export const api = {
  claudeStatus: () => get<ClaudeAuth | null>('/api/claude/status'),
  usage: () => get<UsageSnapshot | null>('/api/usage'),
  refreshClaude: () => fetch('/api/claude/refresh', { method: 'POST' }),
};

/** 'loading' also covers a null status (worker has not checked yet); only a loaded status may say connected or not. */
export type ClaudePhase = 'loading' | 'error' | 'in' | 'out';

export function useClaudeStatus(): { c: ClaudeAuth | null | undefined; phase: ClaudePhase; ok: boolean } {
  const q = useQuery({ queryKey: ['claude', 'status'], queryFn: api.claudeStatus });
  const c = q.data;
  const phase: ClaudePhase = q.isError && !c ? 'error' : !c ? 'loading' : c.loggedIn ? 'in' : 'out';
  return { c, phase, ok: q.isSuccess };
}
