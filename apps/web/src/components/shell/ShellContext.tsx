import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** What a page tells the phone top bar: its title, a back target and an optional action button. */
export interface ShellBar { title?: string; back?: { label: string; onBack: () => void }; action?: ReactNode }
const Ctx = createContext<(bar: ShellBar | null) => void>(() => {});

export function ShellProvider({ children }: { children: (bar: ShellBar | null) => ReactNode }) {
  const [bar, setBar] = useState<ShellBar | null>(null);
  return <Ctx.Provider value={setBar}>{children(bar)}</Ctx.Provider>;
}

/**
 * Call from a page; the bar resets when the page unmounts. `key` lists what the bar depends on. `null`: leave the bar alone (a page
 * embedded in another page, such as the audit log inside a library detail tab, must not take over its host's bar).
 */
export function useShellBar(bar: ShellBar | null, key: unknown[]): void {
  const set = useContext(Ctx);
  useEffect(() => {
    if (!bar) return;
    set(bar);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, key);
}
