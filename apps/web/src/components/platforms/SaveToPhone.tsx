import { useRef, useState } from 'react';
import { blobUrl } from '../../lib/api.ts';
import { downloadHref, downloadName, saveMode, shareFailure } from '../../lib/platform-view.ts';

type Phase = { k: 'idle' } | { k: 'fetching'; pct: number | null } | { k: 'ready'; file: File } | { k: 'error'; msg: string };
const BTN = 'inline-flex min-h-11 items-center justify-center rounded-control bg-ember px-4 text-[14px] font-bold text-white shadow-ember focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow';

/**
 * Video library L20: on a share-capable phone the file is fetched first (progress, cancellable) and shared on a second, fresh tap — iOS
 * refuses share() once the first tap's activation is spent. Elsewhere it is a plain download of the same file.
 */
export function SaveToPhone({ sha, productName }: { sha: string; productName: string }) {
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const name = downloadName(productName);
  const href = downloadHref(sha, productName);
  const canShare = saveMode(typeof navigator === 'undefined' ? undefined : navigator, new File([], name, { type: 'video/mp4' })) === 'share';

  if (!canShare) return <a data-testid="save-to-phone" href={href} download={name} className={BTN}>Save to phone</a>;

  const fetchFile = async () => {
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase({ k: 'fetching', pct: 0 });
    try {
      const r = await fetch(blobUrl(sha), { signal: ctl.signal });
      if (!r.ok || !r.body) throw new Error(`The download failed (${r.status}).`);
      const total = Number(r.headers.get('content-length') ?? 0);
      const reader = r.body.getReader();
      const parts: BlobPart[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.byteLength;
        setPhase({ k: 'fetching', pct: total ? Math.round((got / total) * 100) : null });
      }
      setPhase({ k: 'ready', file: new File(parts, name, { type: 'video/mp4' }) });
    } catch (e) {
      setPhase((e as Error).name === 'AbortError' ? { k: 'idle' } : { k: 'error', msg: (e as Error).message });
    }
  };
  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file] });
      setPhase({ k: 'idle' });
    } catch (e) {
      if (shareFailure(e) === 'cancelled') return;
      setPhase({ k: 'error', msg: 'Sharing failed. Use the download link instead.' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {phase.k === 'idle' && <button type="button" data-testid="save-to-phone" onClick={fetchFile} className={BTN}>Save to phone</button>}
      {phase.k === 'fetching' && (
        <>
          <span data-testid="save-progress" role="status" className="text-[13px] tabular-nums text-ink-2">Preparing the video… {phase.pct === null ? '' : `${phase.pct}%`}</span>
          <button type="button" onClick={() => abort.current?.abort()} className="min-h-11 px-3 text-[13px] text-ink-2">Cancel</button>
        </>
      )}
      {phase.k === 'ready' && <button type="button" data-testid="save-video" onClick={() => share(phase.file)} className={BTN}>Save video</button>}
      {phase.k === 'error' && (
        <>
          <span role="alert" className="text-[13px] text-red">{phase.msg}</span>
          <a href={href} download={name} className="inline-flex min-h-11 items-center text-[13px] text-accent-glow underline">Download instead</a>
        </>
      )}
    </div>
  );
}
