import { useEffect, useState } from 'react';

/** Re-renders every `ms` (1 s for elapsed timers and "N sn önce"). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(h);
  }, [ms]);
  return now;
}
