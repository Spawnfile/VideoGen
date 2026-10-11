import { useState } from 'react';
import type { RunView, VideoView } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { DURATION_SOURCE_EN, VIDEO_STATUS_EN, windowLabel } from '../../lib/i18n.ts';
import { activeStep, formatEta, formatUsage, isRunActive, roundLabel, finalRoundLabel, sourceLabel, videoTone } from '../../lib/production-view.ts';

const BADGE: Record<ReturnType<typeof videoTone>, string> = {
  active: 'bg-accent-glow/10 text-accent-glow',
  ok: 'bg-green/10 text-green',
  error: 'bg-red/10 text-red/90',
  waiting: 'bg-inset text-ink',
  muted: 'bg-inset text-ink-2',
};

export function VideoHeader({ video, run }: { video: VideoView; run: RunView | null }) {
  const [busy, setBusy] = useState(false);
  const active = isRunActive(run);
  const step = activeStep(run);
  const progress = run?.progress ?? 0;
  const round = roundLabel(run);
  const isFinal = !!finalRoundLabel(run);
  const meta = [active ? formatEta(run!.etaS) : '', step && step.progressSource ? sourceLabel(step.progressSource) : '', formatUsage(video.usage)].filter(Boolean);
  const stop = async () => {
    if (!run || busy) return;
    setBusy(true);
    await api.cancelRun(run.id).catch(() => undefined);
    setBusy(false);
  };
  return (
    <header data-testid="video-header" data-status={video.status} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[18px] font-medium break-words">{video.productName}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${BADGE[videoTone(video.status)]}`}>{VIDEO_STATUS_EN[video.status]}</span>
        <span className="text-[12px] text-ink-3">{video.audioMode === 'vo' ? 'With voiceover' : 'No voiceover'}</span>
        <span data-testid="video-duration" title="Priority: your choice > agent suggestion > default" className="rounded-full border border-line px-2 py-0.5 text-[12px] tabular-nums text-ink-2">
          {windowLabel(video.duration)} · {DURATION_SOURCE_EN[video.durationSource]}
        </span>
        {active && (
          <button type="button" disabled={busy} onClick={() => void stop()} className="ml-auto rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow disabled:opacity-50">
            Stop production
          </button>
        )}
      </div>
      {video.brief && (
        <details data-testid="video-brief" className="text-[13px] text-ink-2">
          <summary className="cursor-pointer select-none text-ink-3 hover:text-ink">Brief</summary>
          <p className="mt-1 max-w-[80ch] whitespace-pre-wrap leading-relaxed">{video.brief}</p>
        </details>
      )}
      {video.statusNote && <p className="text-[13px] leading-relaxed text-ink-2">{video.statusNote}</p>}
      <div className="flex items-center gap-3">
        <span role="progressbar" aria-label="Overall progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-inset">
          <span className="absolute inset-y-0 left-0 rounded-full bg-accent-glow transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </span>
        <span className="w-12 text-right text-[13px] font-medium tabular-nums">{Math.round(progress)}%</span>
      </div>
      {round && <p data-testid={isFinal ? 'final-round' : 'draft-round'} className="text-[12.5px] tabular-nums text-accent-glow">{round}</p>}
      {meta.length > 0 && <p className="text-[12px] tabular-nums text-ink-3">{meta.join(' · ')}</p>}
    </header>
  );
}
