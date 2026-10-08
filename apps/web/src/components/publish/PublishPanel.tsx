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
      if (window.confirm('Bu sürüm zaten taslak olarak gönderildi. Yeniden taslak gönderilsin mi?')) await send(true);
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
        className="self-start rounded-control bg-accent px-4 py-1.5 text-[13px] text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
      >
        Yayınla
      </button>
    );
  }
  return (
    <section role="region" aria-labelledby="publish-heading" data-testid="publish-panel" className="flex flex-col gap-3 rounded-card bg-paper p-4 shadow-subtle">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="publish-heading" className="text-[14px] font-medium">Yayın</h2>
        {q.data && <span className="text-[12px] text-ink-2">{q.data.username ? `@${q.data.username} · ` : ''}{view?.draftsLabel}</span>}
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-[12px] text-ink-2 hover:text-ink">Kapat</button>
      </div>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Yayın bilgisi alınıyor</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red/80">Yayın bilgisi alınamadı.</p>}
      {view && q.data && (
        <>
          <p className="text-[12.5px] text-ink-2">
            Video TikTok gelen kutunuza <span className="text-ink">taslak</span> olarak gider; açıklamayı ve sesi uygulamada ekleyip Herkes ile paylaşırsınız.
          </p>
          <div className="flex gap-1" role="radiogroup" aria-label="Gönderilecek varyant">
            {([['tiktok', 'Müziksiz (önerilen)'], ['music', 'Müzikli']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={variant === id}
                data-testid={`publish-variant-${id}`}
                disabled={!q.data.variants[id]}
                onClick={() => setVariant(id)}
                className={`rounded-full px-3 py-1 text-[12px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-40 ${variant === id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
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
              <span className="font-medium">Açıklama (taslakla birlikte kaydedilir; atıf satırları korunur)</span>
              <textarea
                data-testid="publish-caption"
                value={caption ?? view.caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                maxLength={2200}
                className="rounded-input border border-line bg-paper px-2.5 py-1.5 text-[13px] leading-relaxed focus-visible:outline-2 focus-visible:outline-ink"
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
                className="rounded-control bg-accent px-3 py-1.5 text-[13px] text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40"
              >
                {view.resend ? 'Yeniden taslak gönder' : "TikTok'a taslak gönder"}
              </button>
            )}
            {view.stageLabel && (
              <span role="status" data-testid="publish-stage" data-stage={view.stage} className={`text-[12.5px] ${view.stage === 'failed' ? 'text-red/80' : view.stage === 'published' ? 'text-green' : 'text-ink'}`}>
                {view.stageLabel}
              </span>
            )}
            {view.canCancel && (
              <button type="button" onClick={() => void cancel()} className="rounded-control border border-line-strong px-2.5 py-1 text-[12px] hover:bg-hover-2">İptal</button>
            )}
          </div>
          {view.resend && view.latest?.status === 'published' && view.latest.url && (
            <p className="text-[12.5px]">Yayında: <a href={view.latest.url} target="_blank" rel="noreferrer noopener" className="text-accent underline">{view.latest.url}</a></p>
          )}
          {view.showFinish && view.latest && (
            <FinishCard publication={view.latest} checklist={q.data.checklist[view.latest.variant]} aigcNote={view.aigcNote} onMarked={() => void refresh().then(() => qc.invalidateQueries({ queryKey: ['video', videoId] }))} />
          )}
          {error && <p role="alert" className="text-[12.5px] text-red/80">{error}</p>}
          {q.data.claims.length > 0 && (
            <details className="text-[12.5px]">
              <summary className="cursor-pointer text-ink-2">Kaynaklar ({q.data.claims.length})</summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {q.data.claims.map((c) => (
                  <li key={c.id}>
                    <span>{c.text_tr}</span>
                    {(Array.isArray(c.sources) ? (c.sources as { url?: string }[]) : []).filter((s) => typeof s.url === 'string' && /^https?:\/\//.test(s.url)).map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="ml-2 break-all text-accent underline">{new URL(s.url!).hostname}</a>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <PublishHistory publications={q.data.publications} />
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <button type="button" data-testid="shorts-download" disabled={!q.data.variants.music} onClick={() => void exportShorts()} className="self-start rounded-control border border-line-strong px-3 py-1 text-[12.5px] hover:bg-hover-2 disabled:opacity-40">
              Shorts için indir (müzikli)
            </button>
            {shorts && <p className="text-[12px] text-ink-2">{shorts.fileName} indiriliyor. Açıklama ve atıflar: <span className="whitespace-pre-wrap text-ink">{shorts.caption}</span></p>}
          </div>
        </>
      )}
    </section>
  );
}
