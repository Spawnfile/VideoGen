import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal sheet on <dialog> (focus trap, Escape and inert background come with showModal): it slides up from the bottom on a phone and
 * is a centered panel from the tablet width up. Clicking the backdrop closes it.
 */
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet fixed inset-0 h-dvh w-screen"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {open && (
        <div
          className={`sheet-panel absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-sheet border-t border-line bg-paper pb-safe md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[80dvh] ${wide ? 'md:w-[min(92vw,720px)]' : 'md:w-[min(92vw,480px)]'} md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border md:pb-0`}
          style={{ marginBottom: 'var(--kb-inset, 0px)' }}
        >
          <div className="flex items-center gap-3 px-4 pt-2 pb-3 md:px-5 md:pt-4">
            <span aria-hidden className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong md:hidden" />
            <h2 id={titleId} className="mt-3 flex-1 text-[17px] font-medium md:mt-0">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="mt-3 flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-glow md:mt-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
