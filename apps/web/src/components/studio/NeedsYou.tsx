import type { VideoView } from '@videogen/shared/browser';

/** Spec E15: other videos waiting for the user, in amber (it needs a decision, it has not failed). */
export function NeedsYou({ videos, onOpen }: { videos: VideoView[]; onOpen: (id: string) => void }) {
  if (videos.length === 0) return null;
  return (
    <div data-testid="needs-you" className="flex flex-col gap-2">
      {videos.map((v) => (
        <div key={v.id} className="flex items-center gap-3 rounded-card border border-amber/35 bg-amber/5 py-2.5 pr-2.5 pl-3.5">
          <div className="min-w-0 flex-1">
            <p className="label-mono truncate text-amber">{v.productName} · Needs you</p>
            {v.statusNote && <p className="mt-0.5 truncate text-[13px] text-ink-2">{v.statusNote}</p>}
          </div>
          <button type="button" onClick={() => onOpen(v.id)} aria-label={`Open ${v.productName}`} className="min-h-11 shrink-0 rounded-control border border-amber/50 px-3 text-[13px] font-medium text-amber focus-visible:outline-2 focus-visible:outline-accent-glow">
            Open
          </button>
        </div>
      ))}
    </div>
  );
}
