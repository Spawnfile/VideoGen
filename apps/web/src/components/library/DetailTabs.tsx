import type { ReactNode } from 'react';

export type DetailTab = 'versions' | 'reviews' | 'storyboard' | 'research' | 'audit' | 'publish';
export const DETAIL_TABS: [DetailTab, string][] = [
  ['versions', 'Sürümler'], ['reviews', "Review'lar"], ['storyboard', 'Storyboard'], ['research', 'Araştırma ve kaynaklar'], ['audit', 'Audit'], ['publish', 'Yayın'],
];

/** Plan M7 Y7 library detail tabs; only the open tab's panel is mounted (the audit list and the publish info load when opened). */
export function DetailTabs({ tab, onTab, children }: { tab: DetailTab; onTab: (t: DetailTab) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Video ayrıntısı" className="flex flex-wrap gap-1 border-b border-line pb-2">
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
            className={`rounded-full px-3 py-1 text-[13px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${tab === id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
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
