import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentSample, AgentSessionView, ChatMessage, ClaudeAuth, GpuWait, GuardState, LiveTraceItem, RunView, TraceRow, UsageSnapshot, VideoView } from '@videogen/shared/browser';
import { AppShell } from './components/AppShell.tsx';
import { connectLive, onLiveEvent, onUiEvent } from './lib/live.ts';
import { activePlayer, shortcutFor } from './lib/player.ts';
import { applyDelta, applyGpuWait, applyMessage, applyRow, applyRun, applySample, applySession, applyVideo } from './lib/stores.ts';
import { useRoute } from './lib/router.ts';
import { Library } from './routes/Library.tsx';
import { Settings } from './routes/Settings.tsx';
import { Studio } from './routes/Studio.tsx';
import './styles/theme.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: true } } });

function App() {
  const [path, go] = useRoute();
  useEffect(() => {
    // A fresh SSE connect starts at the current max id (no history replay), so REST state is refetched on every open.
    const stop = connectLive('/events', {
      onOpen: () => {
        for (const key of ['claude', 'usage', 'sessions', 'threads', 'thread', 'trace', 'roles', 'videos', 'video']) void queryClient.invalidateQueries({ queryKey: [key] });
      },
    });
    const offUi = onUiEvent((e) => {
      if (e.topic === 'system' && e.type === 'claude.auth') queryClient.setQueryData(['claude', 'status'], e.payload as ClaudeAuth);
      if (e.topic === 'system' && e.type === 'usage') queryClient.setQueryData(['usage'], e.payload as UsageSnapshot);
      if (e.type === 'usage.guard') queryClient.setQueryData(['usage', 'guard'], e.payload as GuardState);
      if (e.type === 'agent.session') applySession(e.payload as AgentSessionView, e.id);
      if (e.type === 'trace.row') applyRow(e.payload as TraceRow, e.id);
      if (e.type === 'chat.message') applyMessage(e.payload as ChatMessage, e.id);
      if (e.type === 'video.updated') applyVideo(e.payload as VideoView, e.id);
      if (e.type === 'run.updated') applyRun(e.payload as RunView, e.id);
    });
    const offLive = onLiveEvent((e) => {
      if (e.type === 'trace.delta') {
        const p = e.payload as { sessionId: string; d: LiveTraceItem[] };
        applyDelta(p.sessionId, p.d);
      }
      if (e.type === 'agent.sample') applySample(e.payload as AgentSample);
      if (e.type === 'agent.gpu_wait') applyGpuWait(e.payload as GpuWait);
    });
    return () => { offUi(); offLive(); stop(); };
  }, []);
  // Spec §13.4: Space / J / K / L drive the visible draft player; N opens a new production (the product box in the Studio).
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = shortcutFor({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: e.target as HTMLElement | null });
      if (!a) return;
      if (a === 'new') {
        e.preventDefault();
        if (location.pathname !== '/') goRef.current('/');
        requestAnimationFrame(() => document.getElementById('product-name')?.focus());
        return;
      }
      const p = activePlayer();
      if (!p) return;
      e.preventDefault();
      if (a === 'toggle') p.toggle();
      else if (a === 'pause') p.pause();
      else p.seekBy(a === 'back' ? -5 : 5);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);
  const page = path === '/settings' ? <Settings /> : path === '/library' ? <Library go={go} /> : <Studio />;
  return <AppShell path={path} go={go}>{page}</AppShell>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
