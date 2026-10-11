import type { ReactNode } from 'react';
import { StatusPill } from './StatusSheet.tsx';

/** Phone: the page title (or a back link) and the status pill; sits under the status bar in standalone mode. */
export function TopBar({ title, back, onStatus, action }: { title: string; back?: { label: string; onBack: () => void }; onStatus: () => void; action?: ReactNode }) {
  return (
    <header className="flex items-center gap-3 bg-canvas px-4 pt-safe">
      <div className="flex min-h-14 min-w-0 flex-1 items-center gap-1">
        {back && (
          <button type="button" onClick={back.onBack} aria-label={`Back to ${back.label}`} className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        )}
        <h1 className="truncate text-[20px] font-medium tracking-tight">{title}</h1>
      </div>
      {action}
      <StatusPill onOpen={onStatus} />
    </header>
  );
}
