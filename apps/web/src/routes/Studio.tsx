import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AgentPanel } from '../components/agents/AgentPanel.tsx';
import { ChatPanel } from '../components/chat/ChatPanel.tsx';
import { ProduceBar } from '../components/production/ProduceBar.tsx';
import { ProductionPanel } from '../components/production/ProductionPanel.tsx';
import { api } from '../lib/api.ts';
import { pickVideoId } from '../lib/production-view.ts';
import { pipeline, seedVideos, useStore, videoList } from '../lib/stores.ts';

const param = () => new URLSearchParams(location.search).get('video');

export function Studio() {
  useQuery({ queryKey: ['videos'], queryFn: async () => { const r = await api.videos(); seedVideos(r.data, r.eventId); return r.data.length; } });
  const state = useStore(pipeline);
  const videos = useMemo(() => videoList(state), [state]);
  const [wanted, setWanted] = useState<string | null>(param);
  const selected = pickVideoId(wanted, videos);
  const select = (id: string) => {
    setWanted(id);
    history.replaceState(null, '', `/?video=${id}`);
  };
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <ProduceBar onCreated={select} />
      <div className="grid min-h-0 grid-cols-[minmax(420px,44%)_1fr]">
        <section aria-label="Üretim" className="flex min-h-0 flex-col gap-6 overflow-y-auto border-r border-line p-6">
          <ProductionPanel videoId={selected} />
          <AgentPanel />
        </section>
        <section aria-label="Chat" className="flex min-h-0 flex-col p-6">
          <ChatPanel />
        </section>
      </div>
    </div>
  );
}
