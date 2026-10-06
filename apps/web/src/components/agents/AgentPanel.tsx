import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ACTIVE_STATUSES } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { agents, seedSessions, useStore } from '../../lib/stores.ts';
import { AgentCard } from './AgentCard.tsx';

const RECENT = 6;

export function AgentPanel() {
  useQuery({ queryKey: ['sessions'], queryFn: async () => { const r = await api.sessions(); seedSessions(r.data, r.eventId); return r.data.length; } });
  const state = useStore(agents);
  const { active, recent } = useMemo(() => {
    const list = Object.values(state.sessions).map((v) => v.value).filter((s) => s.kind === 'pipeline').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { active: list.filter((s) => ACTIVE_STATUSES.includes(s.status)), recent: list.filter((s) => !ACTIVE_STATUSES.includes(s.status)).slice(0, RECENT) };
  }, [state.sessions]);

  return (
    <section aria-labelledby="agents-heading" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id="agents-heading" className="text-[14px] font-medium">Agent'lar</h2>
        <span className="text-[12px] text-ink-3">{active.length ? `${active.length} aktif` : 'şu an çalışan yok'}</span>
      </div>
      {active.length + recent.length === 0 ? (
        <p className="text-[13px] text-ink-2">Agent başladığında burada canlı kartıyla görünür: ne yaptığı, ilerlemesi ve süreç durumu.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...active, ...recent].map((s) => <AgentCard key={s.id} session={s} sample={state.samples[s.id]} />)}
        </div>
      )}
    </section>
  );
}
