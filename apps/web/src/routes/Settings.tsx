import { useEffect, useRef } from 'react';
import { api, useClaudeStatus, type ClaudePhase } from '../lib/api.ts';
import { ago } from '../lib/format.ts';

const POLL_MS = 15_000;
const STATUS: Record<ClaudePhase, [dot: string, text: string]> = {
  loading: ['bg-line-strong', 'Durum alınıyor'],
  error: ['bg-line-strong', 'Durum alınamadı'],
  in: ['bg-green', 'Bağlı'],
  out: ['bg-red', 'Bağlı değil'],
};

export function Settings() {
  const { c, phase, ok } = useClaudeStatus();
  const inFlight = useRef(false);
  const refresh = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    api.refreshClaude().catch(() => undefined).finally(() => { inFlight.current = false; });
  };
  // Each refresh writes an audit row and spawns the CLI on the worker: poll only while visible, loaded and logged out.
  useEffect(() => {
    if (!ok || phase !== 'out') return;
    const h = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    return () => clearInterval(h);
  }, [ok, phase]);
  const [dot, text] = STATUS[phase];

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 p-8">
      <h1 className="text-[16px] font-medium">Ayarlar</h1>
      <section className="rounded-card bg-paper p-4 shadow-subtle">
        <h2 className="mb-3 text-[14px] font-medium">Claude bağlantısı</h2>
        <dl className="grid grid-cols-[160px_1fr] gap-y-2">
          <dt className="text-ink-2">Durum</dt>
          <dd className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${dot}`} />
            {text}
          </dd>
          <dt className="text-ink-2">Yöntem</dt>
          <dd>{c?.authMethod === 'claude.ai' ? 'claude.ai aboneliği' : (c?.authMethod ?? '—')}</dd>
          <dt className="text-ink-2">Plan</dt>
          <dd className="capitalize">{c?.subscriptionType ?? '—'}</dd>
          <dt className="text-ink-2">Son kontrol</dt>
          <dd>{ago(c?.checkedAt)}</dd>
        </dl>
        {phase === 'out' && (
          <p className="mt-4 rounded-input bg-inset p-3 text-ink-2">
            Terminalde <code className="font-mono text-ink">claude auth login</code> çalıştırın (Claude Code içindeyseniz{' '}
            <code className="font-mono text-ink">! claude auth login</code>). Giriş tamamlanınca bu kart kendiliğinden güncellenir.
            {c?.error && <span className="mt-2 block text-[12px] text-red">Son hata: {c.error}</span>}
          </p>
        )}
        <button
          type="button"
          onClick={refresh}
          className="mt-4 rounded-control border border-line px-3 py-2 text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Durumu yenile
        </button>
      </section>
    </div>
  );
}
