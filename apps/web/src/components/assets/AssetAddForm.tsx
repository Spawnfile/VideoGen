import { useState } from 'react';
import { LEDGER_KINDS, type LedgerKind } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { addFormErrors, KIND_LABEL, LICENSE_OPTIONS, type AddForm } from '../../lib/assets-view.ts';

const field = 'h-10 rounded-control border border-line bg-inset px-2 md:h-8 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow';
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
      if (!r.data.created) setResult({ tone: a.allowed ? 'ok' : 'error', text: `This file is already in the ledger: ${a.title} (${a.allowed ? 'allowed' : 'not allowed'}).` });
      else if (!a.allowed) setResult({ tone: 'error', text: `Recorded but not allowed: ${a.reason ?? a.licenseSpdx}` });
      else onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-testid="asset-add"
      aria-label="Add an asset"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className="grid grid-cols-1 gap-3 rounded-card bg-paper px-4 py-3 md:grid-cols-2"
    >
      <label className={`${label} md:col-span-2`}>
        File (wav, mp3, flac, ogg, m4a · up to 200 MB)
        <input type="file" accept=".wav,.mp3,.flac,.ogg,.m4a,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px] text-ink" />
      </label>
      <label className={label}>
        Kind
        <select value={f.kind} onChange={set('kind')} className={field}>
          {LEDGER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className={label}>
        License
        <select value={f.license} onChange={set('license')} className={field}>
          {LICENSE_OPTIONS.map((o) => <option key={o.spdx} value={o.spdx}>{o.label}</option>)}
        </select>
      </label>
      <label className={label}>Title<input value={f.title} onChange={set('title')} maxLength={200} className={field} /></label>
      <label className={label}>Author<input value={f.author} onChange={set('author')} maxLength={200} className={field} /></label>
      <label className={label}>Source link<input value={f.source} onChange={set('source')} maxLength={500} placeholder="https://…" className={field} /></label>
      <label className={label}>
        Attribution{f.license === 'CC-BY-4.0' ? ' (required)' : ''}
        <input value={f.attribution} onChange={set('attribution')} maxLength={500} placeholder="Music: Name Surname (CC BY 4.0)" className={field} />
      </label>
      <label className={`${label} md:col-span-2`}>
        License text
        <textarea value={f.licenseText} onChange={set('licenseText')} rows={3} className="rounded-control border border-line bg-inset px-2 py-1.5 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow" />
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-10 rounded-control bg-accent px-4 py-1.5 text-[13px] font-medium text-white md:min-h-0 md:px-3 transition-opacity duration-100 hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow"
        >
          {busy ? 'Uploading…' : 'Upload and add'}
        </button>
        {result && <p role="status" className={`text-[12.5px] ${result.tone === 'error' ? 'text-red' : 'text-ink-2'}`}>{result.text}</p>}
      </div>
      {tried && errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-[12.5px] text-red md:col-span-2">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </form>
  );
}
