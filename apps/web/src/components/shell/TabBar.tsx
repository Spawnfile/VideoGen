import { activeTab, MOBILE_TABS } from '../../lib/nav.ts';
import { NavIcon } from './NavIcon.tsx';

/** Phone: four tabs in the thumb zone; Audit log and Assets are inside Settings. */
export function TabBar({ path, go, chatLive = false }: { path: string; go: (p: string) => void; chatLive?: boolean }) {
  const current = activeTab(path);
  return (
    <nav aria-label="Main menu" className="grid grid-cols-4 border-t border-line bg-canvas/95 px-1 pt-1.5 pb-safe backdrop-blur">
      {MOBILE_TABS.map((t) => {
        const active = current === t.path;
        return (
          <a
            key={t.path}
            href={t.path}
            aria-label={t.label}
            aria-current={active ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); go(t.path); }}
            className={`relative flex min-h-[52px] flex-col items-center gap-1 pb-1 focus-visible:outline-2 focus-visible:outline-accent-glow ${active ? 'text-ink' : 'text-ink-3'}`}
          >
            {active && <span aria-hidden className="absolute -top-1.5 left-1/2 h-0.5 w-[18px] -translate-x-1/2 rounded-full bg-ember" />}
            <span className="flex h-8 w-14 items-center justify-center">
              <NavIcon d={t.icon} />
            </span>
            <span className="label-mono text-[10px]">{t.label}</span>
            {t.path === '/chat' && chatLive && <span aria-label="Reply in progress" className="absolute top-1 left-[calc(50%+12px)] size-1.5 rounded-full bg-ember" />}
          </a>
        );
      })}
    </nav>
  );
}
