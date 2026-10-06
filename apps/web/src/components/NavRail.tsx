const ITEMS: { path: string; label: string; icon: string; enabled: boolean }[] = [
  { path: '/', label: 'Stüdyo', icon: 'M4 5h16v14H4zM10 9.5v5l4-2.5z', enabled: true },
  { path: '/library', label: 'Kütüphane', icon: 'M4 4v16M8 8v12M12 6v14M16 6l4 14', enabled: false },
  { path: '/audit', label: 'Audit', icon: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5', enabled: false },
  { path: '/assets', label: 'Varlıklar', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z', enabled: false },
  { path: '/settings', label: 'Ayarlar', icon: 'M20 6h-7M9 6H4M20 12h-9M7 12H4M20 18h-5M11 18H4M13 4v4M7 10v4M15 16v4', enabled: true },
];

export function NavRail({ path, go }: { path: string; go: (p: string) => void }) {
  return (
    <nav aria-label="Ana menü" className="flex w-14 flex-col items-center gap-1 border-r border-line py-3">
      <img src="/favicon.svg" alt="VideoGen" className="mb-3 size-7" />
      {ITEMS.map((it) => {
        const active = path === it.path;
        return (
          <a
            key={it.path}
            href={it.path}
            aria-label={it.label}
            aria-current={active ? 'page' : undefined}
            aria-disabled={!it.enabled || undefined}
            title={it.enabled ? it.label : `${it.label} (yakında)`}
            onClick={(e) => { e.preventDefault(); if (it.enabled) go(it.path); }}
            className={`flex size-10 items-center justify-center rounded-input transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              active ? 'bg-accent text-white' : it.enabled ? 'text-ink-2 hover:bg-hover-2 hover:text-ink' : 'cursor-not-allowed text-ink-3/60'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={it.icon} />
            </svg>
          </a>
        );
      })}
    </nav>
  );
}
