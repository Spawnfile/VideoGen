import type { ReactNode } from 'react';

export type DetailTab = 'versions' | 'reviews' | 'storyboard' | 'research' | 'audit' | 'publish';
export const DETAIL_TABS: [DetailTab, string][] = [
  ['versions', 'Versions'], ['reviews', 'Reviews'], ['storyboard', 'Storyboard'], ['research', 'Research and sources'], ['audit', 'Audit log'], ['publish', 'Publish'],
];

/** Plan M7 Y7 library detail tabs; only the open tab's panel is mounted (the audit list and the publish info load when opened). */
export function DetailTabs({ tab, onTab, children }: { tab: DetailTab; onTab: (t: DetailTab) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Video details" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2 md:mx-0 md:flex-wrap md:px-0">
        {DETAIL_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`detail-tab-${id}`}
            data-testid="detail-tab"
            aria-selected={tab === id}
            aria-controls="detail-panel"
            onClick={() => onTab(id)}
            className={`min-h-9 shrink-0 rounded-control px-3.5 py-1 text-[13px] whitespace-nowrap transition-colors md:min-h-0 md:px-3 duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow ${tab === id ? 'bg-ink font-medium text-canvas' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="detail-panel" aria-labelledby={`detail-tab-${tab}`} className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}
