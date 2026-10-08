import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api.ts';
import { tiktokView } from '../../lib/publish-view.ts';

const TONE = { ok: 'bg-green/10 text-green', warn: 'bg-red/10 text-red/90', off: 'bg-inset text-ink-2' } as const;

/** Ayarlar → TikTok bağlantısı (spec §13.1, plan Y16/Y22): the account, the token's validity, connect (PKCE) and a connection test. */
export function TikTokSection() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['tiktok'], queryFn: api.tiktok, refetchInterval: pending ? 3000 : false });
  const view = q.data ? tiktokView(q.data) : null;
  const connect = async () => {
    setNote(null);
    const r = await api.tiktokConnect();
    if (!r.ok) { setNote(r.error); return; }
    window.open(r.data.authorizeUrl, '_blank', 'noopener');
    setPending(true);
    setNote('TikTok sayfası yeni sekmede açıldı; izin verdikten sonra bu bölüm kendiliğinden güncellenir (5 dakika).');
    setTimeout(() => { setPending(false); void qc.invalidateQueries({ queryKey: ['tiktok'] }); }, 5 * 60_000);
  };
  const test = async () => {
    setNote(null);
    const r = await api.tiktokTest();
    setNote(r.ok ? `Bağlantı çalışıyor: @${r.data.username} · en uzun video ${r.data.maxDurationS} sn · ${r.data.privacyOptions.includes('PUBLIC_TO_EVERYONE') ? 'herkese açık paylaşım mümkün' : 'hesap gizli'}` : r.error);
    await qc.invalidateQueries({ queryKey: ['tiktok'] });
  };
  return (
    <section data-testid="tiktok-connection" className="rounded-card bg-paper p-4 shadow-subtle" aria-labelledby="tiktok-heading">
      <h2 id="tiktok-heading" className="text-[14px] font-medium">TikTok bağlantısı</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">Videolar TikTok gelen kutusuna taslak olarak gönderilir. Token'lar yalnızca bu bilgisayarda saklanır ve hiçbir ekranda gösterilmez.</p>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Bağlantı durumu alınıyor</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red/80">Bağlantı durumu alınamadı.</p>}
      {view && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${TONE[view.tone]}`}>{view.title}</span>
            <span className="text-[12.5px] text-ink-2">{view.detail}</span>
          </div>
          <div className="flex gap-2">
            {view.action !== 'import' && (
              <button type="button" data-testid="tiktok-connect" onClick={() => void connect()} className="rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink">
                {view.action === 'connect' ? 'Bağlan' : 'Yeniden bağlan'}
              </button>
            )}
            {q.data?.connected && (
              <button type="button" data-testid="tiktok-test" onClick={() => void test()} className="rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink">
                Bağlantıyı sına
              </button>
            )}
          </div>
          {view.action === 'import' && (
            <p className="text-[12px] text-ink-2">
              İlk kurulum: <code className="font-mono text-ink">node bin/tiktok.mjs import</code> mevcut <code className="font-mono text-ink">~/tiktok-poster</code> bağlantısını buraya taşır.
            </p>
          )}
        </div>
      )}
      {note && <p role="status" className="mt-2 text-[12.5px] text-ink">{note}</p>}
    </section>
  );
}
