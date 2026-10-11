import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { AgentPanel } from '../components/agents/AgentPanel.tsx';
import { ChatPanel } from '../components/chat/ChatPanel.tsx';
import { ProduceDock, ProduceForm } from '../components/production/ProduceBar.tsx';
import { ProductionPanel } from '../components/production/ProductionPanel.tsx';
import { Sheet } from '../components/shell/Sheet.tsx';
import { NeedsYou } from '../components/studio/NeedsYou.tsx';
import { VideoBin } from '../components/studio/VideoBin.tsx';
import { api } from '../lib/api.ts';
import { NO_VIDEO, pickVideoId } from '../lib/production-view.ts';
import { pickNeedsYou } from '../lib/poster.ts';
import { pickStudioVideo, pipeline, seedVideos, studioPick, useStore, videoList } from '../lib/stores.ts';
import { useLayout } from '../lib/viewport.ts';

/** "New video" from the keyboard (N), the app shortcut (/?new=1) or the dock opens the form. */
export const NEW_VIDEO_EVENT = 'vg:new-video';

export function Studio() {
  const q = useQuery({ queryKey: ['videos'], queryFn: async () => { const r = await api.videos(); seedVideos(r.data, r.eventId); return r.data.length; } });
  const state = useStore(pipeline);
  const videos = useMemo(() => videoList(state), [state]);
  const wanted = useStore(studioPick);
  const selected = pickVideoId(wanted, videos);
  const layout = useLayout();
  const [sheet, setSheet] = useState(() => new URLSearchParams(location.search).get('new') === '1');
  const select = (id: string) => {
    pickStudioVideo(id);
    history.replaceState(null, '', `/?video=${id}`);
  };
  const created = (id: string) => { setSheet(false); select(id); };
  useEffect(() => {
    const open = () => { if (layout === 'phone') setSheet(true); };
    addEventListener(NEW_VIDEO_EVENT, open);
    return () => removeEventListener(NEW_VIDEO_EVENT, open);
  }, [layout]);

  if (layout === 'phone') {
    const empty = q.isSuccess && videos.length === 0;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {empty ? (
            <div className="flex flex-col gap-6 px-4 pt-10 pb-8">
              <div className="flex flex-col gap-2.5">
                <p className="label-mono text-ink-3">VideoGen Studio</p>
                <h2 className="text-[28px] leading-[1.05] font-bold tracking-[-0.035em] text-balance">Make your first video</h2>
                <p className="text-[14px] leading-relaxed text-ink-2">Type a product. VideoGen researches it, writes the storyboard, renders a draft, reviews it and gets it ready for TikTok.</p>
              </div>
              <ProduceForm variant="hero" onCreated={created} />
            </div>
          ) : (
            <div className="flex flex-col gap-5 px-4 pt-1 pb-6">
              {videos.length > 0 && <VideoBin videos={videos.slice(0, 20)} selected={selected} onSelect={select} onNew={() => setSheet(true)} />}
              <NeedsYou videos={pickNeedsYou(videos, selected)} onOpen={select} />
              <ProductionPanel videoId={selected} />
              <AgentPanel />
            </div>
          )}
        </div>
        {!empty && <ProduceDock onOpen={() => setSheet(true)} />}
        <Sheet open={sheet} onClose={() => setSheet(false)} title="New video">
          <ProduceForm variant="sheet" onCreated={created} />
        </Sheet>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      <ProduceForm variant="bar" onCreated={select} />
      {layout === 'desktop' ? (
        <div className="grid min-h-0 grid-cols-[minmax(420px,44%)_minmax(0,1fr)]">
          <section aria-label="Production" className="flex min-h-0 flex-col gap-6 overflow-y-auto border-r border-line p-6">
            <ProductionPanel videoId={selected} />
            <AgentPanel />
          </section>
          <section aria-label="Chat" className="flex min-h-0 flex-col p-6">
            <ChatPanel onNewThread={() => select(NO_VIDEO)} />
          </section>
        </div>
      ) : (
        <section aria-label="Production" className="min-h-0 overflow-y-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-6 p-6">
            <ProductionPanel videoId={selected} />
            <AgentPanel />
          </div>
        </section>
      )}
    </div>
  );
}


