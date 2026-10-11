import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { AgentPanel } from '../components/agents/AgentPanel.tsx';
import { ChatPanel } from '../components/chat/ChatPanel.tsx';
import { ProduceDock, ProduceForm } from '../components/production/ProduceBar.tsx';
import { ProductionPanel } from '../components/production/ProductionPanel.tsx';
import { Sheet } from '../components/shell/Sheet.tsx';
import { api } from '../lib/api.ts';
import { VIDEO_STATUS_EN } from '../lib/i18n.ts';
import { NO_VIDEO, pickVideoId, videoTone } from '../lib/production-view.ts';
import { pickStudioVideo, pipeline, seedVideos, studioPick, useStore, videoList } from '../lib/stores.ts';
import { useLayout } from '../lib/viewport.ts';

const DOT = { active: 'bg-accent-glow', ok: 'bg-green', error: 'bg-red', waiting: 'border border-ink-2', muted: 'bg-line-strong' } as const;
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
            <div className="flex flex-col gap-5 px-4 pt-10 pb-8">
              <div className="flex flex-col gap-2">
                <h2 className="text-[22px] leading-tight font-medium tracking-tight text-balance">Make your first video</h2>
                <p className="text-[14px] leading-relaxed text-ink-2">Type a product. VideoGen researches it, writes the storyboard, renders a draft, reviews it and gets it ready for TikTok.</p>
              </div>
              <ProduceForm variant="hero" onCreated={created} />
            </div>
          ) : (
            <div className="flex flex-col gap-5 px-4 pt-1 pb-6">
              {videos.length > 0 && (
                <div role="tablist" aria-label="Videos" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                  {videos.slice(0, 20).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      role="tab"
                      aria-selected={v.id === selected}
                      title={VIDEO_STATUS_EN[v.status]}
                      onClick={() => select(v.id)}
                      className={`flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent-glow ${v.id === selected ? 'border-accent bg-accent text-white' : 'border-line text-ink-2'}`}
                    >
                      <span aria-hidden className={`size-1.5 rounded-full ${v.id === selected ? 'bg-white' : DOT[videoTone(v.status)]}`} />
                      {v.productName}
                    </button>
                  ))}
                </div>
              )}
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


