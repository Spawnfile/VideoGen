import type { ReactNode } from 'react';
import { ConnectionBanner } from './ConnectionBanner.tsx';
import { NavRail } from './NavRail.tsx';
import { UsageFooter } from './UsageFooter.tsx';

export function AppShell({ path, go, children }: { path: string; go: (p: string) => void; children: ReactNode }) {
  return (
    <div className="grid h-full grid-cols-[56px_1fr] grid-rows-[1fr_auto]">
      <NavRail path={path} go={go} />
      <main className="flex min-h-0 flex-col overflow-hidden">
        <ConnectionBanner />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </main>
      <div className="col-span-2"><UsageFooter /></div>
    </div>
  );
}
