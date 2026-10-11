import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PLATFORMS, type Platform, type PlatformStatus, type VideoView } from '@videogen/shared/browser';
import { api, blobUrl } from '../../lib/api.ts';
import { PLATFORM_EN, STATUS_EN } from '../../lib/platform-view.ts';
import { formatDay } from '../../lib/production-view.ts';
import { seedVideos } from '../../lib/stores.ts';
import { MarkUploadedSheet } from './MarkUploadedSheet.tsx';
import { SaveToPhone } from './SaveToPhone.tsx';
import { VideoText } from './VideoText.tsx';

const TONE: Record<PlatformStatus, string> = { none: 'text-ink-3', uploaded: 'text-green', outdated: 'text-red' };

/**
 * Video library L22: watch → save to the phone → copy the caption → upload in the platform app → mark it here. The state comes from the
 * live video row (SSE `video.updated`); the history and the licence lines from the platforms endpoint.
 */
export function PlatformsPanel({ video }: { video: VideoView }) {
  const log = useQuery({ queryKey: ['platforms', video.id, video.updatedAt], queryFn: () => api.platforms(video.id) });
  const [sheet, setSheet] = useState<Platform | null>(null);
  const [opened, setOpened] = useState(0);
  const [confirmUndo, setConfirmUndo] = useState<Platform | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const final = video.final;
  if (!final) return <p className="text-[13px] text-ink-2">No final yet, so there is nothing to save or upload.</p>;

  const mark = async (platform: Platform, body: { uploadedAt?: string; url?: string; note?: string }, action: 'uploaded' | 'retracted' = 'uploaded') => {
    const r = await api.markPlatform(video.id, { platform, action, ...body });
    if (!r.ok) return r.error;
    setSheet(null);
    setConfirmUndo(null);
    // Final review: a PWA resumed from the platform app may sit on a half-open stream; read the row back instead of waiting for SSE.
    void api.video(video.id).then((f) => seedVideos([f.data.video], f.eventId), () => {});
    void log.refetch();
    return null;
  };
  const refused = log.data?.refused ?? [];
  return (
    <div data-testid="platforms-panel" className="flex flex-col gap-4">
      <video
        key={final.musicSha}
        src={blobUrl(final.musicSha)}
        poster={final.coverSha ? blobUrl(final.coverSha) : undefined}
        controls
        playsInline
        preload="metadata"
        className="mx-auto aspect-[9/16] max-h-[70dvh] w-full max-w-[360px] rounded-card bg-inset"
      />
      <SaveToPhone sha={final.musicSha} productName={video.productName} />
      {refused.length > 0 && (
        <p role="alert" className="text-[13px] text-red">Not cleared for upload: {refused.join(', ')} is no longer allowed. Fix the sound before uploading.</p>
      )}
      <VideoText video={video} attributions={log.data?.attributions ?? []} />
      <section aria-label="Platforms" className="flex flex-col divide-y divide-line rounded-card bg-paper">
        {PLATFORMS.map((p) => {
          const s = video.platforms[p];
          return (
            <div key={p} data-testid={`platform-row-${p}`} data-status={s.status} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="w-24 text-[14px] font-medium">{PLATFORM_EN[p]}</span>
              <span className={`min-w-0 flex-1 text-[13px] ${TONE[s.status]}`}>
                {STATUS_EN[s.status]}{s.uploadedAt ? ` · ${formatDay(s.uploadedAt)}` : ''}
                {s.url && <> · <a href={s.url} target="_blank" rel="noreferrer" className="text-accent-glow underline">open</a></>}
              </span>
              <span className="flex gap-1">
                <button type="button" data-testid={`mark-uploaded-${p}`} onClick={() => { setErr(null); setOpened((n) => n + 1); setSheet(p); }} className="min-h-10 rounded-control border border-line-strong px-3 text-[13px] hover:bg-hover-2">
                  {s.status === 'none' ? 'Mark uploaded' : 'Uploaded again'}
                </button>
                {s.status !== 'none' && (confirmUndo === p
                  ? <button type="button" data-testid={`undo-confirm-${p}`} onClick={async () => setErr(await mark(p, {}, 'retracted'))} className="min-h-10 rounded-control bg-red/15 px-3 text-[13px] text-red">Confirm undo</button>
                  : <button type="button" data-testid={`undo-${p}`} onClick={() => setConfirmUndo(p)} className="min-h-10 px-2 text-[13px] text-ink-2">Undo</button>)}
              </span>
            </div>
          );
        })}
      </section>
      {err && <span role="alert" className="text-[13px] text-red">{err}</span>}
      <section aria-label="Upload history" className="flex flex-col gap-1">
        <h3 className="text-[13px] font-medium text-ink-2">History</h3>
        {(log.data?.events ?? []).length === 0
          ? <p className="text-[13px] text-ink-3">Nothing marked yet.</p>
          : (
            <ul data-testid="platform-history" className="flex flex-col gap-1 text-[13px] text-ink-2">
              {log.data!.events.map((e) => (
                <li key={e.id}>{formatDay(e.uploadedAt)} · {PLATFORM_EN[e.platform]} · {e.action === 'uploaded' ? 'uploaded' : 'undone'}{e.note ? ` · ${e.note}` : ''}</li>
              ))}
            </ul>
          )}
      </section>
      <MarkUploadedSheet key={opened} platform={sheet} onClose={() => setSheet(null)} onSave={(p, b) => mark(p, b)} />
    </div>
  );
}
