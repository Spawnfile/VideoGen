import { useEffect, useState } from 'react';

export function useRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  return [path, (p) => { history.pushState(null, '', p); setPath(p); }];
}
