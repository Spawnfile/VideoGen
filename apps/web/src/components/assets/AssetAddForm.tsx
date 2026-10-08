import { useState } from 'react';
import { LEDGER_KINDS, type LedgerKind } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { addFormErrors, KIND_LABEL, LICENSE_OPTIONS, type AddForm } from '../../lib/assets-view.ts';

const field = 'h-8 rounded-control border border-line bg-paper px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink';
const label = 'flex flex-col gap-1 text-[12px] text-ink-2';

/** Y8 "Ekle": upload the file (streamed), then import it through the license gate; a rejected file is recorded and its reason shown. */
export function AssetAddForm({ kind: initialKind, onDone }: { kind: LedgerKind; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState<Omit<AddForm, 'fileName'> & { source: string }>({
    kind: initialKind, title: '', license: initialKind === 'voice_ref' ? 'LicenseRef-Own-Voice' : 'CC0-1.0', author: '', licenseText: '', attribution: '', source: '',
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const errors = addFormErrors({ ...f, fileName: file?.name ?? null });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    setTried(true);
    setResult(null);
    if (errors.length || !file) return;
    setBusy(true);
    try {
      const up = await api.upload(file, file.name.split('.').pop()!.toLowerCase());
      if (!up.ok) { setResult({ tone: 'error', text: up.error }); return; }
      const r = await api.importAsset({
        uploadId: up.data.uploadId, kind: f.kind, title: f.title.trim(), license: f.license, author: f.author.trim(), licenseText: f.licenseText,
        ...(f.attribution.trim() ? { attribution: f.attribution.trim() } : {}), ...(f.source.trim() ? { source: f.source.trim() } : {}),
      });
      if (!r.ok) { setResult({ tone: 'error', text: r.error }); return; }
      const a = r.data.asset;
      if (!r.data.created) setResult({ tone: a.allowed ? 'ok' : 'error', text: `Bu dosya defterde zaten var: ${a.title} (${a.allowed ? 'izinli' : 'izinsiz'}).` });
      else if (!a.allowed) setResult({ tone: 'error', text: `Kaydedildi ama izinsiz: ${a.reason ?? a.licenseSpdx}` });
      else onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-testid="asset-add"
      aria-label="Varlık ekle"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className="grid grid-cols-2 gap-3 rounded-card border border-line/60 bg-paper px-4 py-3 shadow-subtle"
    >
      <label className={`${label} col-span-2`}>
        Dosya (wav, mp3, flac, ogg, m4a · en çok 200 MB)
        <input type="file" accept=".wav,.mp3,.flac,.ogg,.m4a,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px] text-ink" />
      </label>
      <label className={label}>
        Tür
        <select value={f.kind} onChange={set('kind')} className={field}>
          {LEDGER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className={label}>
        Lisans
        <select value={f.license} onChange={set('license')} className={field}>
          {LICENSE_OPTIONS.map((o) => <option key={o.spdx} value={o.spdx}>{o.label}</option>)}
        </select>
      </label>
      <label className={label}>Başlık<input value={f.title} onChange={set('title')} maxLength={200} className={field} /></label>
      <label className={label}>Yazar<input value={f.author} onChange={set('author')} maxLength={200} className={field} /></label>
      <label className={label}>Kaynak bağlantısı<input value={f.source} onChange={set('source')} maxLength={500} placeholder="https://…" className={field} /></label>
      <label className={label}>
        Atıf{f.license === 'CC-BY-4.0' ? ' (zorunlu)' : ''}
        <input value={f.attribution} onChange={set('attribution')} maxLength={500} placeholder="Müzik: Ad Soyad (CC BY 4.0)" className={field} />
      </label>
      <label className={`${label} col-span-2`}>
        Lisans metni
        <textarea value={f.licenseText} onChange={set('licenseText')} rows={3} className="rounded-control border border-line bg-paper px-2 py-1.5 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink" />
      </label>
      <div className="col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-control bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity duration-100 hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {busy ? 'Yükleniyor…' : 'Yükle ve ekle'}
        </button>
        {result && <p role="status" className={`text-[12.5px] ${result.tone === 'error' ? 'text-red/80' : 'text-ink-2'}`}>{result.text}</p>}
      </div>
      {tried && errors.length > 0 && (
        <ul role="alert" className="col-span-2 list-disc pl-5 text-[12.5px] text-red/80">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </form>
  );
}
