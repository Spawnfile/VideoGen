import { useEffect, useState } from 'react';

const here = () => ({ path: location.pathname, search: location.search });

/** `go(url)` keeps the query string (`/audit?run=…`); `replace` edits the current history entry instead of adding one. */
export function useRoute(): [string, (url: string, opts?: { replace?: boolean }) => void, string] {
  const [at, setAt] = useState(here);
  useEffect(() => {
    const on = () => setAt(here());
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const go = (url: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    const u = new URL(url, location.origin);
    setAt({ path: u.pathname, search: u.search });
  };
  return [at.path, go, at.search];
}
