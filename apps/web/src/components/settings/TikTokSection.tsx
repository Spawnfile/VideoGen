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
  // The PKCE callback is a localhost URL: connecting only works in a browser on this computer (the API refuses it over the tailnet).
  const onHost = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const connect = async () => {
    setNote(null);
    const r = await api.tiktokConnect();
    if (!r.ok) { setNote(r.error); return; }
    window.open(r.data.authorizeUrl, '_blank', 'noopener');
    setPending(true);
    setNote('The TikTok page opened in a new tab; this section updates by itself after you allow access (within 5 minutes).');
    setTimeout(() => { setPending(false); void qc.invalidateQueries({ queryKey: ['tiktok'] }); }, 5 * 60_000);
  };
  const test = async () => {
    setNote(null);
    const r = await api.tiktokTest();
    setNote(r.ok ? `The connection works: @${r.data.username} · longest video ${r.data.maxDurationS} s · ${r.data.privacyOptions.includes('PUBLIC_TO_EVERYONE') ? 'public posts allowed' : 'private account'}` : r.error);
    await qc.invalidateQueries({ queryKey: ['tiktok'] });
  };
  return (
    <section data-testid="tiktok-connection" className="rounded-card bg-paper p-4" aria-labelledby="tiktok-heading">
      <h2 id="tiktok-heading" className="text-[14px] font-medium">TikTok connection</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">Videos go to your TikTok inbox as drafts. Tokens stay on this computer and are never shown on any screen.</p>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Loading the connection</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red">Could not load the connection.</p>}
      {view && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${TONE[view.tone]}`}>{view.title}</span>
            <span className="text-[12.5px] text-ink-2">{view.detail}</span>
          </div>
          {onHost ? null : (
            <p data-testid="tiktok-on-host" className="rounded-input bg-inset px-3 py-2 text-[12.5px] text-ink-2">
              To connect your TikTok account, open VideoGen on this computer. Once it is connected, you can publish from your phone.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {view.action !== 'import' && onHost && (
              <button type="button" data-testid="tiktok-connect" onClick={() => void connect()} className="min-h-10 rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow md:min-h-0">
                {view.action === 'connect' ? 'Connect' : 'Reconnect'}
              </button>
            )}
            {q.data?.connected && (
              <button type="button" data-testid="tiktok-test" onClick={() => void test()} className="min-h-10 rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow md:min-h-0">
                Test the connection
              </button>
            )}
          </div>
          {view.action === 'import' && (
            <p className="text-[12px] text-ink-2">
              First setup: <code className="font-mono text-ink">node bin/tiktok.mjs import</code> brings the existing <code className="font-mono text-ink">~/tiktok-poster</code> connection here.
            </p>
          )}
        </div>
      )}
      {note && <p role="status" className="mt-2 text-[12.5px] text-ink">{note}</p>}
    </section>
  );
}
