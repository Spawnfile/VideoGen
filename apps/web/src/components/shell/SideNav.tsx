import { activeNav, NAV_ITEMS } from '../../lib/nav.ts';
import { NavIcon } from './NavIcon.tsx';

/**
 * Tablet: an icon rail. Desktop (≥ 1200 px): a labelled sidebar. The desktop Studio shows the chat beside the production, so Chat is a
 * rail item only on tablets.
 */
export function SideNav({ path, go }: { path: string; go: (p: string) => void }) {
  return (
    <nav aria-label="Main menu" className="flex h-full w-16 flex-col items-center gap-1 border-r border-line py-3 desk:w-[220px] desk:items-stretch desk:px-3">
      <a href="/" onClick={(e) => { e.preventDefault(); go('/'); }} className="mb-4 flex items-center gap-2.5 rounded-input px-1 focus-visible:outline-2 focus-visible:outline-accent-glow desk:px-2">
        <img src="/favicon.svg" alt="" className="size-8 rounded-[9px]" />
        <span className="hidden text-[15px] font-bold tracking-[-0.02em] desk:inline">VideoGen</span>
      </a>
      {NAV_ITEMS.map((it) => {
        const active = activeNav(path, it.path);
        return (
          <a
            key={it.path}
            href={it.path}
            aria-label={it.label}
            aria-current={active ? 'page' : undefined}
            title={it.label}
            onClick={(e) => { e.preventDefault(); go(it.path); }}
            className={`relative flex size-11 items-center justify-center gap-3 rounded-input transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow desk:h-10 desk:w-full desk:justify-start desk:px-3 ${
              it.path === '/chat' ? 'desk:hidden' : ''
            } ${active ? 'bg-inset text-ink' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
          >
            {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-ember" />}
            <NavIcon d={it.icon} size={18} />
            <span className="hidden text-[14px] desk:inline">{it.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
