import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.ts';
import { bytesLabel, dataView, type BackupTone } from '../../lib/maintenance-view.ts';

const BACKUP_TONE: Record<BackupTone, string> = { ok: 'text-green', old: 'text-ink', failed: 'text-red', never: 'text-ink-2' };
const BACKUP_DOT: Record<BackupTone, string> = { ok: 'bg-green', old: 'bg-line-strong', failed: 'bg-red', never: 'bg-line-strong' };
const BUTTON = 'rounded-control border border-line-strong px-3 py-1 text-[13px] transition-colors duration-100 hover:bg-hover-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink';

/**
 * Plan M7 Y11: Ayarlar → "Veri ve yedek". Disk, database and media sizes, the last backup with "Şimdi yedekle", the latest GC report with a
 * confirmed "Sil…" (the user types the candidate count; the API re-checks every Y10 condition) and the orphan report (report only).
 */
export function DataSection() {
  const qc = useQueryClient();
  const [watchUntil, setWatchUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const q = useQuery({ queryKey: ['maintenance'], queryFn: api.maintenance, refetchInterval: (s) => (s.state.data?.running || now < watchUntil ? 2000 : 60_000) });
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 2000); return () => clearInterval(h); }, []);
  const view = q.data ? dataView(q.data, now) : null;

  const run = async (what: 'backup' | 'gc-report' | 'orphans') => {
    setNote(null);
    const r = await api.runMaintenance(what);
    if (!r.ok) { setNote({ text: r.error, error: true }); return; }
    setWatchUntil(Date.now() + 20_000);
    await qc.invalidateQueries({ queryKey: ['maintenance'] });
  };
  const remove = async () => {
    if (!q.data?.gc || busy) return;
    setBusy(true);
    setNote(null);
    const r = await api.gcDelete(q.data.gc.reportId, typed.trim());
    setBusy(false);
    if (!r.ok) { setNote({ text: r.error, error: true }); return; }
    setConfirming(false);
    setTyped('');
    setNote({ text: `${r.data.deleted} dosya çöp kutusuna taşındı (${bytesLabel(r.data.bytes)}); ${r.data.skipped} dosya yeniden kullanıldığı için atlandı. Çöp kutusu 7 gün sonra boşaltılır.`, error: false });
    await qc.invalidateQueries({ queryKey: ['maintenance'] });
  };

  return (
    <section data-testid="data-status" className="rounded-card bg-paper p-4 shadow-subtle" aria-labelledby="data-heading">
      <h2 id="data-heading" className="text-[14px] font-medium">Veri ve yedek</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">
        Veritabanı her gün yedeklenir (son 7 gün). Medya dosyaları yedeğe girmez; silinen medya 7 gün çöp kutusunda kalır ve <code className="font-mono text-ink">bin/maintenance.mjs restore-blob</code> ile geri alınabilir.
      </p>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Durum alınıyor</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red/80">Durum alınamadı.</p>}
      {view && q.data && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[160px_1fr] gap-y-1.5 text-[13px]">
            {view.lines.map((l) => (
              <div key={l.label} className="contents">
                <dt className="text-ink-2">{l.label}</dt>
                <dd className={l.label === 'Veri dizini' ? 'break-all font-mono text-[12.5px]' : 'tabular-nums'}>{l.value}</dd>
              </div>
            ))}
          </dl>
          {view.runningText && <p role="status" className="text-[12.5px] text-ink">{view.runningText}</p>}

          <div className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-medium">Yedek</h3>
            <p data-testid="backup-status" className={`flex items-center gap-2 text-[12.5px] ${BACKUP_TONE[view.backupTone]}`}>
              <span aria-hidden className={`size-2 rounded-full ${BACKUP_DOT[view.backupTone]}`} />
              {view.backupText}
            </p>
            <div>
              <button type="button" data-testid="backup-now" disabled={q.data.running !== null} onClick={() => void run('backup')} className={BUTTON}>Şimdi yedekle</button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-medium">Çöp toplama</h3>
            <p className="text-[12.5px] text-ink-2">Hiçbir yerden başvurulmayan ve 7 gündür kullanılmayan medya dosyaları. Rapor her pazartesi kendiliğinden hazırlanır.</p>
            <p data-testid="gc-status" className="text-[12.5px]">{view.gcText}</p>
            {q.data.gc?.lastDelete && (
              <p className="text-[12px] text-ink-2">
                Son silme: {q.data.gc.lastDelete.ok ? `${q.data.gc.lastDelete.deleted} dosya · ${bytesLabel(q.data.gc.lastDelete.bytes)}` : `yarıda kaldı (${q.data.gc.lastDelete.error ?? 'hata'})`}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="gc-report" disabled={q.data.running !== null} onClick={() => void run('gc-report')} className={BUTTON}>Rapor oluştur</button>
              {view.deleteLabel && !confirming && (
                <button type="button" data-testid="gc-delete" disabled={!view.canDelete} onClick={() => { setConfirming(true); setTyped(''); setNote(null); }} className={BUTTON}>
                  Sil…
                </button>
              )}
            </div>
            {view.deleteNote && <p className="text-[12px] text-ink-2">{view.deleteNote}</p>}
            {confirming && q.data.gc && (
              <div role="alertdialog" aria-label="Medya dosyalarını sil" className="flex flex-col gap-2 rounded-input bg-inset px-3 py-2.5">
                <p className="text-[12.5px]">
                  {view.deleteLabel}: dosyalar çöp kutusuna taşınır, 7 gün sonra kalıcı olarak silinir. Onaylamak için aday sayısını ({q.data.gc.candidates}) yazın.
                </p>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  inputMode="numeric"
                  aria-label="Aday sayısı"
                  data-testid="gc-confirm-count"
                  className="h-8 w-32 rounded-control border border-line bg-paper px-2 text-[13px] tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid="gc-confirm"
                    disabled={busy || typed.trim() !== String(q.data.gc.candidates)}
                    onClick={() => void remove()}
                    className="rounded-control bg-red px-3 py-1 text-[12.5px] font-medium text-white transition-opacity duration-100 hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
                  >
                    {view.deleteLabel}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="rounded-control px-3 py-1 text-[12.5px] text-ink-2 hover:bg-hover-2">Vazgeç</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-medium">Yetim dosyalar</h3>
            <p className="text-[12.5px] text-ink-2">Yalnızca rapor: diskte olup kaydı olmayan ya da kaydı olup diskte olmayan dosyalar silinmez.</p>
            <p data-testid="orphan-status" className="text-[12.5px]">{view.orphanText}</p>
            {q.data.orphans && (q.data.orphans.diskOnly + q.data.orphans.dbOnly + q.data.orphans.sizeMismatch + q.data.orphans.strayRunDirs > 0) && (
              <details className="text-[12px] text-ink-2">
                <summary className="cursor-pointer">Ayrıntı</summary>
                <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11.5px] break-all">
                  {q.data.orphans.samples.diskOnly.map((x) => <li key={`d${x}`}>diskte: {x}</li>)}
                  {q.data.orphans.samples.dbOnly.map((x) => <li key={`b${x}`}>veritabanında: {x}</li>)}
                  {q.data.orphans.samples.sizeMismatch.map((x) => <li key={`s${x}`}>boyut: {x}</li>)}
                  {q.data.orphans.samples.strayRunDirs.map((x) => <li key={`r${x}`}>run: {x}</li>)}
                </ul>
              </details>
            )}
            <div>
              <button type="button" data-testid="orphan-report" disabled={q.data.running !== null} onClick={() => void run('orphans')} className={BUTTON}>Rapor oluştur</button>
            </div>
          </div>
        </div>
      )}
      {note && <p role={note.error ? 'alert' : 'status'} className={`mt-3 text-[12.5px] ${note.error ? 'text-red/80' : 'text-ink'}`}>{note.text}</p>}
    </section>
  );
}
