import { useQuery } from '@tanstack/react-query';
import type { PublishInfo, TikTokStatus } from './publish-view.ts';
import type { Publication, PublishVariant } from '@videogen/shared/browser';
import type { AgentSessionView, ArtifactMeta, AssetListItem, LedgerKind, AuditActionCount, AuditDetail, AuditPage, AuditVerifyResult, AudioMode, ChannelStyleId, ChatMessage, ChatMode, ChatThread, ClaudeAuth, Effort, GuardState, MaintenanceInfo, ModelAlias, NarratorVoice, SafeArea, SafeAreaState, ReviewRecord, RoleName, RunView, TraceRow, UsageSnapshot, VersionView, VideoView, VoiceEngine } from '@videogen/shared/browser';

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
  reviews: (id: string) => get<ReviewRecord[]>(`/api/videos/${id}/reviews`),
  // Plan M7 Y7: the library detail's versions and one version's review rounds.
  versions: (id: string) => get<VersionView[]>(`/api/videos/${id}/versions`),
  versionReviews: (id: string, versionId: string) => get<ReviewRecord[]>(`/api/videos/${id}/reviews?version=${encodeURIComponent(versionId)}`),
  run: (id: string) => getFresh<RunView>(`/api/runs/${id}`),
  cancelRun: (id: string) => send<{ accepted: boolean }>('POST', `/api/runs/${id}/cancel`),
  artifact: (id: string) => get<ArtifactMeta & { content: unknown }>(`/api/artifacts/${id}`),
  channelStyle: () => get<ChannelStyleState>('/api/channel-style'),
  setChannelStyle: (id: ChannelStyleId) => send<ChannelStyleState>('PUT', '/api/channel-style', { id }),
  narratorVoice: () => get<NarratorVoiceState>('/api/narrator-voice'),
  setNarratorVoice: (voice: NarratorVoice) => send<NarratorVoiceState>('PUT', '/api/narrator-voice', voice),
  publishInfo: (videoId: string) => get<PublishInfo>(`/api/videos/${videoId}/publish`),
  publish: (videoId: string, body: { variant: PublishVariant; caption?: string; confirmResend?: boolean }) =>
    write<{ publication: Publication }>(`/api/videos/${videoId}/publish`, body),
  markPublished: (id: string, url: string, checklist: Record<string, boolean>) => write<{ publication: Publication }>(`/api/publications/${id}/mark`, { url, checklist }),
  cancelPublication: (id: string) => write<{ publication: Publication }>(`/api/publications/${id}/cancel`, {}),
  exportShorts: (videoId: string) => write<{ url: string; fileName: string; caption: string }>(`/api/videos/${videoId}/exports/shorts`, {}),
  tiktok: () => get<TikTokStatus>('/api/tiktok'),
  tiktokConnect: () => write<{ authorizeUrl: string; expiresAt: string }>('/api/tiktok/connect', {}),
  // Plan M7 Y5: read-only audit explorer; the list path comes from audit-view's auditListPath.
  auditPage: (path: string) => get<AuditPage>(path),
  auditActions: () => get<AuditActionCount[]>('/api/audit/actions'),
  auditRow: (seq: number) => get<AuditDetail>(`/api/audit/${seq}`),
  auditVerify: (fresh = false) => get<AuditVerifyResult & { cached: boolean }>(`/api/audit/verify${fresh ? '?fresh=1' : ''}`),
  tiktokTest: () => write<{ username: string; maxDurationS: number; privacyOptions: string[] }>('/api/tiktok/test', {}),
  // Plan M7 Y8: the asset ledger.
  assets: () => get<AssetListItem[]>('/api/assets'),
  upload: async (file: File, ext: string): Promise<WriteResult<{ uploadId: string; sha: string; bytes: number; durationMs: number }>> => {
    const r = await fetch(`/api/uploads?ext=${encodeURIComponent(ext)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return r.ok ? { ok: true, data: j as { uploadId: string; sha: string; bytes: number; durationMs: number } } : { ok: false, status: r.status, error: typeof j.error === 'string' ? j.error : `Yükleme başarısız (${r.status})`, body: j };
  },
  importAsset: (body: { uploadId: string; kind: LedgerKind; title: string; license: string; author: string; licenseText: string; attribution?: string; source?: string }) =>
    write<{ created: boolean; asset: AssetListItem }>('/api/assets', body),
  revokeAsset: (id: string, reason: string) => write<{ asset: AssetListItem; narratorReset: boolean }>(`/api/assets/${id}/revoke`, { reason }),
  // Plan M7 Y11: Settings → "Veri ve yedek" and the footer's free disk.
  maintenance: () => get<MaintenanceInfo>('/api/maintenance'),
  runMaintenance: (what: 'backup' | 'gc-report' | 'orphans') => write<{ accepted: boolean; kind: string }>(`/api/maintenance/${what}`, {}),
  gcDelete: (reportId: string, confirm: string) => write<{ deleted: number; skipped: number; bytes: number }>('/api/maintenance/gc', { reportId, confirm }),
  // Plan M7 Y15/Y16: Settings → "Güvenli alan".
  safeArea: () => get<SafeAreaState>('/api/safe-area'),
  setSafeArea: (body: { area: SafeArea; note?: string } | { reset: true }) => write<SafeAreaState>('/api/safe-area', body, 'PUT'),
};

/** A POST (or PUT) whose error body (`{error, …}`) matters to the caller: the Turkish reason is shown as is. */
export type WriteResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; body: Record<string, unknown> };
async function write<T>(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<WriteResult<T>> {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return r.ok ? { ok: true, data: j as T } : { ok: false, status: r.status, error: typeof j.error === 'string' ? j.error : `İstek başarısız (${r.status})`, body: j };
}

/** GET/PUT /api/narrator-voice (K17: `chosen:false` = the provisional default is in use). */
export interface NarratorVoiceState {
  voice: NarratorVoice;
  chosen: boolean;
  options: { engine: VoiceEngine; voices: { kind: 'preset' | 'clone'; id?: string; asset_id?: string; label_tr: string }[] }[];
}

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
