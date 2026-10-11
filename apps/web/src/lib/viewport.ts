import { useEffect, useState } from 'react';

export type Layout = 'phone' | 'tablet' | 'desktop';
/** Tailwind's `md` (768) and the desktop two-pane width (1200, `xl2` in theme.css). */
export const PHONE_MAX = 767;
export const DESKTOP_MIN = 1200;

export const layoutFor = (width: number): Layout => (width <= PHONE_MAX ? 'phone' : width < DESKTOP_MIN ? 'tablet' : 'desktop');

/** How much of the layout viewport an on-screen keyboard covers (iOS does not resize the layout viewport for it). */
export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number } | null): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
}

export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(() => layoutFor(innerWidth));
  useEffect(() => {
    const on = () => setLayout(layoutFor(innerWidth));
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return layout;
}

/** Keeps `--kb-inset` on <html> equal to the keyboard's height, so docked inputs can sit above it. */
export function watchKeyboard(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const on = () => {
    const inset = keyboardInset(innerHeight, vv);
    document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    // A keyboard is taller than 120 px; smaller differences are browser chrome sliding in and out.
    if (inset > 120) document.documentElement.dataset.kb = 'open';
    else delete document.documentElement.dataset.kb;
  };
  vv.addEventListener('resize', on);
  vv.addEventListener('scroll', on);
  on();
  return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
}
