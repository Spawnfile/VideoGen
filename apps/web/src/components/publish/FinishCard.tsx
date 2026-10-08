import { useState } from 'react';
import { canMarkPublished, type ChecklistItem, type Publication } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';

/**
 * Spec §10 bitirme kartı (plan Y13): the caption to paste in the TikTok app, the checklist (sound for the music-less variant, Herkes,
 * the AI label when the voice is a clone, the commercial-content switch) and "Yayınlandı olarak işaretle" with the video's URL.
 */
export function FinishCard({ publication, checklist, aigcNote, onMarked }: { publication: Publication; checklist: ChecklistItem[]; aigcNote: string | null; onMarked: () => void }) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const why = canMarkPublished(checklist, ticked, url);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publication.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Panoya kopyalanamadı; metni seçip kopyalayın.');
    }
  };
  const mark = async () => {
    if (why || busy) return;
    setBusy(true);
    setError(null);
    const r = await api.markPublished(publication.id, url.trim(), ticked);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onMarked();
  };
  return (
    <div data-testid="finish-card" className="flex flex-col gap-3 rounded-input border border-line p-3">
      <p className="text-[13px]">
        Taslak TikTok gelen kutunuzda. Uygulamada açın, açıklamayı yapıştırın ve aşağıdaki maddeleri tamamlayıp paylaşın.
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-medium">Açıklama</span>
          <button type="button" data-testid="caption-copy" onClick={() => void copy()} className="rounded-control border border-line-strong px-2.5 py-0.5 text-[12px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink">
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
        <pre data-testid="finish-caption" className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-input bg-inset p-2 font-sans text-[12.5px] leading-relaxed">{publication.caption}</pre>
      </div>
      {aigcNote && <p className="text-[12.5px] font-medium text-accent">{aigcNote}</p>}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[12.5px] font-medium">Paylaşmadan önce</legend>
        {checklist.map((i) => (
          <label key={i.id} className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              data-testid={`check-${i.id}`}
              checked={!!ticked[i.id]}
              onChange={(e) => setTicked((t) => ({ ...t, [i.id]: e.target.checked }))}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span>{i.label_tr}{i.required && <span className="text-ink-3"> · zorunlu</span>}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-[12.5px]">
        <span className="font-medium">TikTok video bağlantısı</span>
        <input
          type="url"
          data-testid="published-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@hesap/video/…"
          className="rounded-input border border-line bg-paper px-2.5 py-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-ink"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="mark-published"
          disabled={!!why || busy}
          onClick={() => void mark()}
          className="rounded-control bg-accent px-3 py-1.5 text-[13px] text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40"
        >
          Yayınlandı olarak işaretle
        </button>
        {why && <span className="text-[12px] text-ink-2">{why}</span>}
      </div>
      {error && <p role="alert" className="text-[12.5px] text-red/80">{error}</p>}
    </div>
  );
}
