import { useState } from 'react';
import type { RunView, VideoView } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { DURATION_SOURCE_EN, VIDEO_STATUS_EN, windowLabel } from '../../lib/i18n.ts';
import { LABEL_CLASS, videoLabel } from '../../lib/poster.ts';
import { activeStep, formatEta, formatUsage, isRunActive, roundLabel, finalRoundLabel, sourceLabel } from '../../lib/production-view.ts';

export function VideoHeader({ video, run }: { video: VideoView; run: RunView | null }) {
  const [busy, setBusy] = useState(false);
  const active = isRunActive(run);
  const step = activeStep(run);
  const progress = run?.progress ?? 0;
  const round = roundLabel(run);
  const isFinal = !!finalRoundLabel(run);
  const label = videoLabel(video, run);
  const meta = [active ? formatEta(run!.etaS) : '', step && step.progressSource ? sourceLabel(step.progressSource) : '', formatUsage(video.usage)].filter(Boolean);
  const stop = async () => {
    if (!run || busy) return;
    setBusy(true);
    await api.cancelRun(run.id).catch(() => undefined);
    setBusy(false);
  };
  return (
    <header data-testid="video-header" data-status={video.status} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[26px] leading-none font-bold tracking-[-0.035em] break-words">{video.productName}</h2>
          <p className="label-mono mt-2 flex flex-wrap gap-x-1.5 gap-y-0.5 text-ink-3">
            <span className={LABEL_CLASS[label.tone]}>{VIDEO_STATUS_EN[video.status]}{label.tone === 'live' && run ? ` · ${label.text}` : ''}</span>
            <span aria-hidden>·</span>
            <span>{video.audioMode === 'vo' ? 'With voiceover' : 'No voiceover'}</span>
            <span aria-hidden>·</span>
            <span data-testid="video-duration" title="Priority: your choice > agent suggestion > default">{windowLabel(video.duration)} · {DURATION_SOURCE_EN[video.durationSource]}</span>
          </p>
        </div>
        {active && (
          <button type="button" disabled={busy} onClick={() => void stop()} className="shrink-0 rounded-control border border-line-strong px-3 py-1.5 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow disabled:opacity-50">
            Stop production
          </button>
        )}
      </div>
      {video.brief && (
        <details data-testid="video-brief" className="text-[13px] text-ink-2">
          <summary className="label-mono cursor-pointer select-none text-ink-3 hover:text-ink">Brief</summary>
          <p className="mt-1 max-w-[80ch] whitespace-pre-wrap leading-relaxed">{video.brief}</p>
        </details>
      )}
      {video.statusNote && <p className="text-[13px] leading-relaxed text-ink-2">{video.statusNote}</p>}
      <div className="flex items-center gap-3">
        <span role="progressbar" aria-label="Overall progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-inset">
          <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${active ? 'bg-ember' : 'bg-ink-3'}`} style={{ width: `${progress}%` }} />
        </span>
        <span className="w-12 text-right font-mono text-[12px] font-medium tabular-nums">{Math.round(progress)}%</span>
      </div>
      {round && <p data-testid={isFinal ? 'final-round' : 'draft-round'} className="font-mono text-[12px] tabular-nums text-accent">{round}</p>}
      {meta.length > 0 && <p className="font-mono text-[11.5px] tabular-nums text-ink-3">{meta.join(' · ')}</p>}
    </header>
  );
}
