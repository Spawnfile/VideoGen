import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentSample, AgentSessionView, ChatMessage, ClaudeAuth, GuardState, LiveTraceItem, RunView, TraceRow, UsageSnapshot, VideoView } from '@videogen/shared/browser';
import { AppShell } from './components/AppShell.tsx';
import { connectLive, onLiveEvent, onUiEvent } from './lib/live.ts';
import { applyDelta, applyMessage, applyRow, applyRun, applySample, applySession, applyVideo } from './lib/stores.ts';
import { useRoute } from './lib/router.ts';
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
    });
    return () => { offUi(); offLive(); stop(); };
  }, []);
  return <AppShell path={path} go={go}>{path === '/settings' ? <Settings /> : <Studio />}</AppShell>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
