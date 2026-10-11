import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChannelStyleSection } from '../components/settings/ChannelStyleSection.tsx';
import { DataSection } from '../components/settings/DataSection.tsx';
import { DeviceSection } from '../components/settings/DeviceSection.tsx';
import { NarratorVoiceSection } from '../components/settings/NarratorVoiceSection.tsx';
import { RolesSection } from '../components/settings/RolesSection.tsx';
import { SafeAreaSection } from '../components/settings/SafeAreaSection.tsx';
import { TikTokSection } from '../components/settings/TikTokSection.tsx';
import { useShellBar } from '../components/shell/ShellContext.tsx';
import { StatusBody } from '../components/shell/StatusSheet.tsx';
import { useStatus } from '../components/shell/useStatus.ts';
import { api, useClaudeStatus, type ClaudePhase } from '../lib/api.ts';
import { ago } from '../lib/format.ts';
import { useLayout } from '../lib/viewport.ts';

const POLL_MS = 15_000;
const STATUS: Record<ClaudePhase, [dot: string, text: string]> = {
  loading: ['bg-line-strong', 'Checking'],
  error: ['bg-line-strong', 'Status unavailable'],
  in: ['bg-green', 'Connected'],
  out: ['bg-red', 'Not connected'],
};

function ClaudeSection() {
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
    <section className="rounded-card bg-paper p-4" aria-labelledby="claude-heading">
      <h2 id="claude-heading" className="mb-3 text-[14px] font-medium">Claude connection</h2>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 md:grid-cols-[160px_minmax(0,1fr)]">
        <dt className="text-ink-2">Status</dt>
        <dd className="flex items-center gap-2"><span className={`size-2 rounded-full ${dot}`} />{text}</dd>
        <dt className="text-ink-2">Method</dt>
        <dd>{c?.authMethod === 'claude.ai' ? 'claude.ai subscription' : (c?.authMethod ?? '—')}</dd>
        <dt className="text-ink-2">Plan</dt>
        <dd className="capitalize">{c?.subscriptionType ?? '—'}</dd>
        <dt className="text-ink-2">Last check</dt>
        <dd>{ago(c?.checkedAt)}</dd>
      </dl>
      {phase === 'out' && (
        <p className="mt-4 rounded-input bg-inset p-3 text-ink-2">
          Run <code className="font-mono text-ink">claude auth login</code> in a terminal (inside Claude Code: <code className="font-mono text-ink">! claude auth login</code>). This card updates by itself once you are signed in.
          {c?.error && <span className="mt-2 block text-[12px] text-red">Last error: {c.error}</span>}
        </p>
      )}
      <button type="button" onClick={refresh} className="mt-4 min-h-10 rounded-control border border-line px-3 py-2 text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow">
        Refresh status
      </button>
    </section>
  );
}

function UsageSection() {
  const s = useStatus();
  return <section className="rounded-card bg-paper p-4"><StatusBody s={s} /></section>;
}

type SectionId = 'claude' | 'usage' | 'channel' | 'narrator' | 'safe-area' | 'tiktok' | 'roles' | 'data' | 'device';
interface Row { id: SectionId | 'audit' | 'assets'; label: string; render?: () => ReactNode }
const GROUPS: { title: string; rows: Row[] }[] = [
  { title: 'Account and usage', rows: [{ id: 'claude', label: 'Claude connection', render: () => <ClaudeSection /> }, { id: 'usage', label: 'Usage and status', render: () => <UsageSection /> }] },
  { title: 'Channel', rows: [
    { id: 'channel', label: 'Channel identity', render: () => <ChannelStyleSection /> },
    { id: 'narrator', label: 'Narrator voice', render: () => <NarratorVoiceSection /> },
    { id: 'safe-area', label: 'Safe area', render: () => <SafeAreaSection /> },
    { id: 'tiktok', label: 'TikTok connection', render: () => <TikTokSection /> },
  ] },
  { title: 'Agents', rows: [{ id: 'roles', label: 'Agent roles', render: () => <RolesSection /> }] },
  { title: 'Logs and assets', rows: [{ id: 'audit', label: 'Audit log' }, { id: 'assets', label: 'Assets' }] },
  { title: 'Data', rows: [{ id: 'data', label: 'Data and backups', render: () => <DataSection /> }] },
  { title: 'This device', rows: [{ id: 'device', label: 'App on this device', render: () => <DeviceSection /> }] },
];
const ROWS = GROUPS.flatMap((g) => g.rows);

/** Phone: grouped rows, each opening its section on its own page (the back arrow returns). Tablet and desktop: one long page. */
export function Settings({ go }: { go: (url: string) => void }) {
  const layout = useLayout();
  const [open, setOpen] = useState<SectionId | null>(() => (location.hash.slice(1) as SectionId) || null);
  const row = ROWS.find((r) => r.id === open);
  useShellBar(row ? { title: row.label, back: { label: 'Settings', onBack: () => setOpen(null) } } : {}, [row?.id]);
  useEffect(() => { history.replaceState(history.state, '', open ? `/settings#${open}` : '/settings'); }, [open]);

  if (layout !== 'phone') {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col gap-4 p-6 desk:p-8">
        <h1 className="text-[16px] font-medium">Settings</h1>
        <ClaudeSection />
        <ChannelStyleSection />
        <NarratorVoiceSection />
        <SafeAreaSection />
        <TikTokSection />
        <RolesSection />
        <DataSection />
        <DeviceSection />
      </div>
    );
  }
  if (row?.render) return <div className="flex flex-col gap-4 px-4 pt-2 pb-8">{row.render()}</div>;
  return (
    <div data-testid="settings-list" className="flex flex-col gap-5 px-4 pt-2 pb-8">
      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title} className="flex flex-col gap-1.5">
          <h2 className="px-1 text-[12px] text-ink-3">{g.title}</h2>
          <ul className="divide-y divide-line rounded-card bg-paper">
            {g.rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => (r.id === 'audit' || r.id === 'assets' ? go(`/${r.id}`) : setOpen(r.id))}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] first:rounded-t-card last:rounded-b-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-glow"
                >
                  <span className="flex-1">{r.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-ink-3" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
