import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { ClaudeAuth, UsageSnapshot } from '@videogen/shared/browser';
import { AppShell } from './components/AppShell.tsx';
import { connectLive, onUiEvent } from './lib/live.ts';
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
        void queryClient.invalidateQueries({ queryKey: ['claude'] });
        void queryClient.invalidateQueries({ queryKey: ['usage'] });
      },
    });
    const off = onUiEvent((e) => {
      if (e.topic === 'system' && e.type === 'claude.auth') queryClient.setQueryData(['claude', 'status'], e.payload as ClaudeAuth);
      if (e.topic === 'system' && e.type === 'usage') queryClient.setQueryData(['usage'], e.payload as UsageSnapshot);
    });
    return () => { off(); stop(); };
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
