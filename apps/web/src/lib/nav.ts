/** One navigation model for the phone tab bar, the tablet icon rail and the desktop sidebar. */
export interface NavItem { path: string; label: string; icon: string }

const ICONS = {
  studio: 'M4 5h16v14H4zM10 9.5v5l4-2.5z',
  chat: 'M5 5h14v10H10l-5 4z',
  library: 'M4 4v16M8 8v12M12 6v14M16 6l4 14',
  audit: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  assets: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z',
  settings: 'M20 6h-7M9 6H4M20 12h-9M7 12H4M20 18h-5M11 18H4M13 4v4M7 10v4M15 16v4',
};

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Studio', icon: ICONS.studio },
  { path: '/chat', label: 'Chat', icon: ICONS.chat },
  { path: '/library', label: 'Library', icon: ICONS.library },
  { path: '/audit', label: 'Audit log', icon: ICONS.audit },
  { path: '/assets', label: 'Assets', icon: ICONS.assets },
  { path: '/settings', label: 'Settings', icon: ICONS.settings },
];
/** Audit log and Assets live inside Settings on a phone. */
export const MOBILE_TABS: NavItem[] = NAV_ITEMS.filter((i) => ['/', '/chat', '/library', '/settings'].includes(i.path));

export const activeNav = (path: string, item: string): boolean => path === item || (item !== '/' && path.startsWith(`${item}/`));

export function activeTab(path: string): string {
  if (path === '/audit' || path === '/assets') return '/settings';
  return MOBILE_TABS.find((t) => activeNav(path, t.path))?.path ?? '/';
}

export function titleFor(path: string): string {
  return NAV_ITEMS.find((i) => i.path !== '/' && activeNav(path, i.path))?.label ?? 'Studio';
}
