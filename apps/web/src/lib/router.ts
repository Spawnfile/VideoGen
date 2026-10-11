import { useEffect, useState } from 'react';

const here = () => ({ path: location.pathname, search: location.search });

/** `go(url)` keeps the query string (`/audit?run=…`); `replace` edits the current history entry instead of adding one. */
export interface GoOptions { replace?: boolean; from?: string }

export function useRoute(): [string, (url: string, opts?: GoOptions) => void, string] {
  const [at, setAt] = useState(here);
  useEffect(() => {
    const on = () => setAt(here());
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const go = (url: string, opts?: GoOptions) => {
    const state = opts?.from ? { from: opts.from } : null;
    if (opts?.replace) history.replaceState(state, '', url);
    else history.pushState(state, '', url);
    const u = new URL(url, location.origin);
    setAt({ path: u.pathname, search: u.search });
  };
  return [at.path, go, at.search];
}

/**
 * A top-bar back arrow: when this page was opened from `path` (history state `from`), go back in history so the system back gesture
 * does not loop; otherwise (opened by URL) replace this entry with `path`.
 */
export function backTo(path: string): void {
  if ((history.state as { from?: string } | null)?.from === path) { history.back(); return; }
  history.replaceState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}
