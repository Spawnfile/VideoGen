import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api.ts';
import { narratorOptions } from '../../lib/production-view.ts';

/** K17: the narrator voice (engine + preset or an own voice reference). The default is provisional until the user chooses. */
export function NarratorVoiceSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['narrator-voice'], queryFn: api.narratorVoice });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = q.data ? narratorOptions(q.data) : null;
  const choose = async (key: string) => {
    const item = view?.items.find((i) => i.key === key);
    if (!item || saving || (item.selected && q.data?.chosen)) return;
    setSaving(key);
    setError(null);
    try {
      await api.setNarratorVoice(item.value);
    } catch {
      setError('Ses kaydedilemedi.');
    }
    await qc.invalidateQueries({ queryKey: ['narrator-voice'] });
    setSaving(null);
  };
  return (
    <section data-testid="narrator-voice" className="rounded-card bg-paper p-4 shadow-subtle" aria-labelledby="narrator-heading">
      <h2 id="narrator-heading" className="text-[14px] font-medium">Anlatıcı sesi</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">
        Seslendirmeli videolarda anlatımı okuyan yerel ses. Seçim bir sonraki seslendirmede geçerli olur ve audit'e yazılır.
        {view?.note && <> {view.note}.</>}
      </p>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Ses seçenekleri alınıyor</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red/80">Ses seçenekleri alınamadı.</p>}
      <div role="radiogroup" aria-label="Anlatıcı sesi" className="flex flex-col gap-1.5">
        {view?.items.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={o.selected}
            disabled={saving !== null}
            onClick={() => void choose(o.key)}
            className={`flex items-center gap-2 rounded-input border px-3 py-2 text-left text-[13px] transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-60 ${o.selected ? 'border-accent' : 'border-line'}`}
          >
            {o.selected && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
            <span className={o.selected ? 'font-medium' : ''}>{o.label}</span>
            {o.provisional && <span className="rounded-full bg-inset px-2 py-0.5 text-[11.5px] text-ink-2">GEÇİCİ (K17)</span>}
          </button>
        ))}
      </div>
      {view && !view.hasClone && (
        <p className="mt-3 text-[12px] text-ink-2">
          Klon için önce kendi sesinizi <code className="font-mono text-ink">bin/assets.mjs add --kind voice_ref</code> ile ekleyin.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-red/80">{error}</p>}
    </section>
  );
}
