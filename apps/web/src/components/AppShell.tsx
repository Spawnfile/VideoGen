import { useEffect, useState, type ReactNode } from 'react';
import { titleFor } from '../lib/nav.ts';
import { watchKeyboard } from '../lib/viewport.ts';
import { ConnectionBanner } from './ConnectionBanner.tsx';
import { ShellProvider } from './shell/ShellContext.tsx';
import { SideNav } from './shell/SideNav.tsx';
import { StatusSheet } from './shell/StatusSheet.tsx';
import { TabBar } from './shell/TabBar.tsx';
import { TopBar } from './shell/TopBar.tsx';
import { UsageFooter } from './UsageFooter.tsx';
import { Unreachable } from './shell/Unreachable.tsx';
import { UpdateToast } from './shell/UpdateToast.tsx';

/**
 * Phone (< 768 px): top bar, content, tab bar. Tablet: icon rail + content + footer. Desktop (≥ 1200 px): labelled sidebar + content +
 * footer. Every layout scrolls its content inside one element, so the bars stay put and safe areas are padded once. The root is pinned to
 * the window (fixed, inset 0) rather than sized with dvh: iOS standalone mode can report a short dvh and lets the page scroll after the
 * keyboard closes, both of which leave the tab bar floating up the screen.
 */
export function AppShell({ path, go, chatLive, children }: { path: string; go: (p: string) => void; chatLive?: boolean; children: ReactNode }) {
  const [status, setStatus] = useState(false);
  useEffect(() => watchKeyboard(), []);
  return (
    <ShellProvider>
      {(bar) => (
        <div className="app-root fixed inset-0 flex flex-col md:grid md:grid-cols-[auto_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto]">
          <div className="hidden min-h-0 md:block">
            <SideNav path={path} go={go} />
          </div>
          <div className="md:hidden">
            <TopBar title={bar?.title ?? titleFor(path)} back={bar?.back} action={bar?.action} onStatus={() => setStatus(true)} />
          </div>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ConnectionBanner />
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain" data-scroll-root>{children}</div>
          </main>
          <div className="tabbar md:hidden">
            <TabBar path={path} go={go} chatLive={chatLive} />
          </div>
          <div className="hidden md:col-span-2 md:block">
            <UsageFooter />
          </div>
          <StatusSheet open={status} onClose={() => setStatus(false)} />
          <UpdateToast />
          <Unreachable />
        </div>
      )}
    </ShellProvider>
  );
}
