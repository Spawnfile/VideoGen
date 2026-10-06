import { useQuery } from '@tanstack/react-query';
import type { AgentSessionView, ArtifactMeta, AudioMode, ChannelStyleId, ChatMessage, ChatMode, ChatThread, ClaudeAuth, Effort, GuardState, ModelAlias, RoleName, RunView, TraceRow, UsageSnapshot, VideoView } from '@videogen/shared/browser';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** GET with the server's freshness watermark (x-vg-event-id: max event id when the read began). */
export async function getFresh<T>(path: string): Promise<{ data: T; eventId: number }> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return { data: (await r.json()) as T, eventId: Number(r.headers.get('x-vg-event-id') ?? 0) };
}

async function send<T>(method: 'POST' | 'PUT', path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

export type { ChatMode } from '@videogen/shared/browser';
export interface RoleSetting { role: RoleName; label: string; model: ModelAlias; effort: Effort; defaults: { model: ModelAlias; effort: Effort } }

export const api = {
  claudeStatus: () => get<ClaudeAuth | null>('/api/claude/status'),
  usage: () => get<UsageSnapshot | null>('/api/usage'),
  refreshClaude: () => fetch('/api/claude/refresh', { method: 'POST' }),
  sessions: () => getFresh<AgentSessionView[]>('/api/sessions?scope=recent&kind=pipeline'),
  trace: (id: string) => getFresh<TraceRow[]>(`/api/sessions/${id}/trace`),
  cancelSession: (id: string) => send<{ accepted: boolean }>('POST', `/api/sessions/${id}/cancel`),
  retrySession: (id: string) => send<{ accepted: boolean }>('POST', `/api/sessions/${id}/retry`),
  threads: () => get<ChatThread[]>('/api/chat/threads'),
  thread: (id: string) => getFresh<{ thread: ChatThread; messages: ChatMessage[] }>(`/api/chat/threads/${id}`),
  createThread: () => send<ChatThread>('POST', '/api/chat/threads', {}),
  sendMessage: (threadId: string, text: string, mode: ChatMode) => send<ChatMessage>('POST', `/api/chat/threads/${threadId}/messages`, { text, mode }),
  interrupt: (threadId: string) => send<{ accepted: boolean }>('POST', `/api/chat/threads/${threadId}/interrupt`),
  roles: () => get<RoleSetting[]>('/api/roles'),
  setRole: (role: RoleName, patch: { model?: ModelAlias; effort?: Effort }) => send<unknown>('PUT', `/api/roles/${role}`, patch),
  guard: () => get<GuardState>('/api/usage/guard'),
  produce: async (productName: string, audioMode: AudioMode): Promise<{ ok: true; videoId: string; runId: string } | { ok: false; error: string }> => {
    const r = await fetch('/api/videos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productName, audioMode }) });
    const body = (await r.json().catch(() => ({}))) as { videoId?: string; runId?: string; error?: string };
    return r.status === 202 && body.videoId && body.runId ? { ok: true, videoId: body.videoId, runId: body.runId } : { ok: false, error: body.error ?? `Üretim başlatılamadı (${r.status})` };
  },
  videos: () => getFresh<VideoView[]>('/api/videos'),
  video: (id: string) => getFresh<{ video: VideoView; runs: RunView[]; artifacts: ArtifactMeta[] }>(`/api/videos/${id}`),
  run: (id: string) => getFresh<RunView>(`/api/runs/${id}`),
  cancelRun: (id: string) => send<{ accepted: boolean }>('POST', `/api/runs/${id}/cancel`),
  artifact: (id: string) => get<ArtifactMeta & { content: unknown }>(`/api/artifacts/${id}`),
  channelStyle: () => get<ChannelStyleState>('/api/channel-style'),
  setChannelStyle: (id: ChannelStyleId) => send<ChannelStyleState>('PUT', '/api/channel-style', { id }),
};

export interface ChannelStyleState {
  id: ChannelStyleId;
  chosen: boolean;
  options: { id: ChannelStyleId; name_tr: string; description_tr: string; image: string }[];
}

/** Content-addressed media (HTTP Range, immutable). */
export const blobUrl = (sha: string) => `/api/blobs/${sha}`;

/** 'loading' also covers a null status (worker has not checked yet); only a loaded status may say connected or not. */
export type ClaudePhase = 'loading' | 'error' | 'in' | 'out';

export function useClaudeStatus(): { c: ClaudeAuth | null | undefined; phase: ClaudePhase; ok: boolean } {
  const q = useQuery({ queryKey: ['claude', 'status'], queryFn: api.claudeStatus });
  const c = q.data;
  const phase: ClaudePhase = q.isError && !c ? 'error' : !c ? 'loading' : c.loggedIn ? 'in' : 'out';
  return { c, phase, ok: q.isSuccess };
}
