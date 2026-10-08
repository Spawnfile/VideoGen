import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DEFAULT_SAFE_AREA, type SafeArea } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';

const BUTTON = 'rounded-control border border-line-strong px-3 py-1 text-[13px] transition-colors duration-100 hover:bg-hover-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink';
const INPUT = 'h-8 rounded-control border border-line bg-paper px-2 text-[13px] tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink';
const SIDES: { key: keyof SafeArea; label: string; hint: string }[] = [
  { key: 'top', label: 'Üst', hint: 'bu y değerinin üstüne yazı girmez' },
  { key: 'bottom', label: 'Alt', hint: 'bu y değerinin altına yazı girmez' },
  { key: 'right', label: 'Sağ', hint: 'sağ kenardan bu kadar piksel boş kalır' },
  { key: 'left', label: 'Sol', hint: 'yazının sol kenar boşluğu' },
];
type Draft = Record<keyof SafeArea, string>;
const toDraft = (a: SafeArea): Draft => ({ top: String(a.top), bottom: String(a.bottom), right: String(a.right), left: String(a.left) });
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

/**
 * Plan M7 Y15/Y16: Ayarlar → "Güvenli alan". The four values every final is laid out and checked (G6) in, at 1080×1920; where they came
 * from (default or read off the calibration card on a phone), the device note, the >150 px warnings and the card instructions.
 */
export function SafeAreaSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['safe-area'], queryFn: api.safeArea });
  const [draft, setDraft] = useState<Draft>(toDraft(DEFAULT_SAFE_AREA));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!q.data) return;
    setDraft(toDraft(q.data.area));
    setNote(q.data.note ?? '');
  }, [q.data]);

  const dirty = !!q.data && (SIDES.some((s) => draft[s.key].trim() !== String(q.data.area[s.key])) || note.trim() !== (q.data.note ?? ''));
  const save = async (body: Parameters<typeof api.setSafeArea>[0]) => {
    setBusy(true);
    setMsg(null);
    const r = await api.setSafeArea(body);
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error, error: true }); return; }
    qc.setQueryData(['safe-area'], r.data);
    setMsg({ text: 'reset' in body ? 'Varsayılan alana dönüldü.' : 'Kaydedildi. Bundan sonraki compose bu alanla yapılır.', error: false });
  };
  const submit = () => {
    const area = Object.fromEntries(SIDES.map((s) => [s.key, Number(draft[s.key].trim())])) as unknown as SafeArea;
    if (SIDES.some((s) => draft[s.key].trim() === '' || !Number.isInteger(area[s.key]))) { setMsg({ text: 'Dört değer de tam sayı olmalı.', error: true }); return; }
    void save({ area, ...(note.trim() ? { note: note.trim() } : {}) });
  };

  return (
    <section data-testid="safe-area-section" className="rounded-card bg-paper p-4 shadow-subtle" aria-labelledby="safe-area-heading">
      <h2 id="safe-area-heading" className="text-[14px] font-medium">Güvenli alan</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">
        TikTok arayüzünün örtmediği yazı alanı (1080×1920 piksel). Finalin yerleşimi ve G6 denetimi bu değerleri kullanır; değer final birleştirmesinin
        girdisidir, değişince eski finaller yeniden birleştirilir.
      </p>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Güvenli alan alınıyor</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red/80">Güvenli alan alınamadı.</p>}
      {q.data && (
        <div className="flex flex-col gap-3">
          <p data-testid="safe-area-source" className="text-[12.5px]">
            Kaynak: {q.data.source === 'calibrated' ? <>telefonda ölçüldü{q.data.measuredAt ? ` · ${when(q.data.measuredAt)}` : ''}</> : 'varsayılan (spec §8.1)'}
            {q.data.note && <span className="text-ink-2"> · {q.data.note}</span>}
          </p>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SIDES.map((s) => (
                <label key={s.key} className="flex flex-col gap-1 text-[12.5px]">
                  <span className="font-medium">{s.label}</span>
                  <input value={draft[s.key]} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} inputMode="numeric" aria-describedby={`safe-${s.key}-hint`} data-testid={`safe-area-${s.key}`} className={`${INPUT} w-24`} />
                  <span id={`safe-${s.key}-hint`} className="text-[11.5px] text-ink-2">{s.hint} (varsayılan {DEFAULT_SAFE_AREA[s.key]})</span>
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-medium">Not</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Cihaz ve TikTok sürümü, örn. Pixel 7 · TikTok 41.2" className={`${INPUT} max-w-[420px]`} />
            </label>
            {q.data.warnings.length > 0 && (
              <ul data-testid="safe-area-warnings" className="flex flex-col gap-0.5 rounded-input bg-inset px-3 py-2 text-[12.5px]">
                {q.data.warnings.map((w) => <li key={w}>Uyarı: {w}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || !dirty} className={BUTTON}>Kaydet</button>
              <button type="button" data-testid="safe-area-reset" disabled={busy || q.data.source === 'default'} onClick={() => void save({ reset: true })} className={BUTTON}>Varsayılana dön</button>
            </div>
          </form>
          {msg && <p role={msg.error ? 'alert' : 'status'} className={`text-[12.5px] ${msg.error ? 'text-red/80' : 'text-ink'}`}>{msg.text}</p>}
          <details className="text-[12.5px]">
            <summary className="cursor-pointer text-ink-2">Kalibrasyon kartı nasıl kullanılır</summary>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-ink-2">
              <li>Kartı üretin: <code className="font-mono text-ink">node bin/safe-area.mjs card</code> → veri dizininde <code className="font-mono text-ink">calibration/safe-area-card.mp4</code> (5 sn) ve aynı karenin PNG'si.</li>
              <li>Videoyu telefona elle aktarın (kablo ya da AirDrop). Kart VideoGen'in yayın yolundan gönderilmez ve taslak sayısına girmez.</li>
              <li>TikTok uygulamasında "Kimler izleyebilir: Yalnızca ben" ile paylaşın, profilinizden akış görünümünde açın ve ekran görüntüsü alın; sonra paylaşımı silin.</li>
              <li>Ekran görüntüsünde arayüz öğelerinin (üstteki sekmeler, alttaki açıklama ve sağdaki düğmeler) başladığı cetvel değerlerini okuyun: satır etiketleri y'dir (Üst, Alt), sağ cetvel sağ kenardan uzaklıktır (Sağ), sol cetvel sol kenardan (Sol).</li>
              <li>Değerleri buraya girin, nota cihazı ve uygulama sürümünü yazın. Varsayılandan 150 pikselden fazla sapan değerde uyarı çıkar: cetveli yeniden okuyun.</li>
            </ol>
          </details>
        </div>
      )}
    </section>
  );
}
