/** M2 §7: a supervisor killed with SIGKILL leaves api/worker orphaned (re-parented). Exit when the parent changes. */
export function watchParent(onGone: () => void, o: { everyMs?: number; getPpid?: () => number } = {}): () => void {
  const get = o.getPpid ?? (() => process.ppid);
  const initial = get();
  if (initial <= 1) return () => {};
  const h = setInterval(() => {
    if (get() !== initial) { clearInterval(h); onGone(); }
  }, o.everyMs ?? 2000);
  h.unref();
  return () => clearInterval(h);
}
