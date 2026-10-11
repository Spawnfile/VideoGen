import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PublishVariant } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { publishPollMs, publishView } from '../../lib/publish-view.ts';
import { FinishCard } from './FinishCard.tsx';
import { PublishHistory } from './PublishHistory.tsx';

/**
 * Plan M6 Y22: "Yayınla" opens the Yayın panel under the final — pre-checks, variant, caption, the TikTok draft send with its live stage,
 * the finish card once the draft is in the inbox, the version's sources, the send history and the Shorts download.
 */
export function PublishPanel({ videoId }: { videoId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<PublishVariant>('tiktok');
  const [caption, setCaption] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shorts, setShorts] = useState<{ url: string; fileName: string; caption: string } | null>(null);
  const q = useQuery({
    queryKey: ['publish', videoId],
    queryFn: () => api.publishInfo(videoId),
    enabled: open,
    // The live stage arrives over SSE (`publish.status` → main.tsx invalidates this query); the slow poll only covers a dropped stream.
    refetchInterval: (query) => publishPollMs(query.state.data),
  });
  const view = q.data ? publishView(q.data, variant) : null;
  useEffect(() => { setCaption(null); }, [variant]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['publish', videoId] });

  const send = async (confirmResend = false) => {
    if (!view || busy) return;
    setBusy(true);
    setError(null);
    const r = await api.publish(videoId, { variant, caption: caption ?? view.caption, ...(confirmResend ? { confirmResend } : {}) });
    setBusy(false);
    if (!r.ok && r.body.confirmResend === true && !confirmResend) {
      if (window.confirm('This version was already sent as a draft. Send it again?')) await send(true);
      return;
    }
    if (!r.ok) setError(r.error);
    await refresh();
  };
  const cancel = async () => {
    if (!view?.latest) return;
    const r = await api.cancelPublication(view.latest.id);
    if (!r.ok) setError(r.error);
    await refresh();
  };
  const exportShorts = async () => {
    const r = await api.exportShorts(videoId);
    if (!r.ok) { setError(r.error); return; }
    setShorts(r.data);
    const a = document.createElement('a');
    a.href = r.data.url;
    a.download = r.data.fileName;
    a.click();
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="publish-open"
        onClick={() => setOpen(true)}
        className="min-h-11 self-stretch rounded-input bg-accent px-4 py-1.5 text-[14px] font-medium text-white md:min-h-0 md:self-start md:rounded-control md:text-[13px] md:font-normal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow"
      >
        Publish
      </button>
    );
  }
  return (
    <section role="region" aria-labelledby="publish-heading" data-testid="publish-panel" className="flex flex-col gap-3 rounded-card bg-paper p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="publish-heading" className="text-[14px] font-medium">Publish</h2>
        {q.data && <span className="text-[12px] text-ink-2">{q.data.username ? `@${q.data.username} · ` : ''}{view?.draftsLabel}</span>}
        <button type="button" onClick={() => setOpen(false)} className="ml-auto min-h-8 px-1 text-[12px] text-ink-2 hover:text-ink">Close</button>
      </div>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Loading publishing details</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red">Could not load publishing details.</p>}
      {view && q.data && (
        <>
          <p className="text-[12.5px] text-ink-2">
            The video goes to your TikTok inbox as a <span className="text-ink">draft</span>; you add the caption and sound in the app and post it to Everyone.
          </p>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Variant to send">
            {([['tiktok', 'No music (recommended)'], ['music', 'With music']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={variant === id}
                data-testid={`publish-variant-${id}`}
                disabled={!q.data.variants[id]}
                onClick={() => setVariant(id)}
                className={`min-h-9 rounded-full px-3.5 py-1 text-[12px] transition-colors md:min-h-0 md:px-3 duration-100 focus-visible:outline-2 focus-visible:outline-accent-glow disabled:opacity-40 ${variant === id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view.blockers.length > 0 && (
            <ul data-testid="publish-blockers" className="flex flex-col gap-1 text-[12.5px] text-ink">
              {view.blockers.map((b) => <li key={b} className="rounded-input bg-inset px-2.5 py-1.5">{b}</li>)}
            </ul>
          )}
          {!view.showFinish && (
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-medium">Caption (saved with the draft; attribution lines are kept)</span>
              <textarea
                data-testid="publish-caption"
                value={caption ?? view.caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                maxLength={2200}
                className="rounded-input border border-line bg-inset px-2.5 py-1.5 text-[13px] leading-relaxed focus-visible:outline-2 focus-visible:outline-accent-glow"
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!view.showFinish && (
              <button
                type="button"
                data-testid="publish-send"
                disabled={!view.canSend || busy}
                onClick={() => void send()}
                className="min-h-10 rounded-input bg-accent px-4 py-1.5 text-[13px] text-white hover:opacity-90 md:min-h-0 md:rounded-control md:px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow disabled:opacity-40"
              >
                {view.resend ? 'Send the draft again' : 'Send draft to TikTok'}
              </button>
            )}
            {view.stageLabel && (
              <span role="status" data-testid="publish-stage" data-stage={view.stage} className={`text-[12.5px] ${view.stage === 'failed' ? 'text-red' : view.stage === 'published' ? 'text-green' : 'text-ink'}`}>
                {view.stageLabel}
              </span>
            )}
            {view.canCancel && (
              <button type="button" onClick={() => void cancel()} className="min-h-9 rounded-control border border-line-strong px-3 py-1 text-[12px] hover:bg-hover-2">Cancel</button>
            )}
          </div>
          {view.resend && view.latest?.status === 'published' && view.latest.url && (
            <p className="text-[12.5px] break-all">Published: <a href={view.latest.url} target="_blank" rel="noreferrer noopener" className="text-accent-glow underline">{view.latest.url}</a></p>
          )}
          {view.showFinish && view.latest && (
            <FinishCard publication={view.latest} checklist={q.data.checklist[view.latest.variant]} aigcNote={view.aigcNote} onMarked={() => void refresh().then(() => qc.invalidateQueries({ queryKey: ['video', videoId] }))} />
          )}
          {error && <p role="alert" className="text-[12.5px] text-red">{error}</p>}
          {q.data.claims.length > 0 && (
            <details className="text-[12.5px]">
              <summary className="cursor-pointer py-1 text-ink-2">Sources ({q.data.claims.length})</summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {q.data.claims.map((c) => (
                  <li key={c.id}>
                    <span>{c.text_tr}</span>
                    {(Array.isArray(c.sources) ? (c.sources as { url?: string }[]) : []).filter((s) => typeof s.url === 'string' && /^https?:\/\//.test(s.url)).map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="ml-2 break-all text-accent-glow underline">{new URL(s.url!).hostname}</a>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <PublishHistory publications={q.data.publications} />
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <button type="button" data-testid="shorts-download" disabled={!q.data.variants.music} onClick={() => void exportShorts()} className="min-h-9 self-start rounded-control border border-line-strong px-3 py-1 text-[12.5px] hover:bg-hover-2 disabled:opacity-40">
              Download for Shorts (with music)
            </button>
            {shorts && <p className="text-[12px] text-ink-2">Downloading {shorts.fileName}. Caption and attributions: <span className="whitespace-pre-wrap text-ink">{shorts.caption}</span></p>}
          </div>
        </>
      )}
    </section>
  );
}
