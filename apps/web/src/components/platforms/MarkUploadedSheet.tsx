import { useState } from 'react';
import type { Platform } from '@videogen/shared/browser';
import { localNowInput, markTimeIso, PLATFORM_EN } from '../../lib/platform-view.ts';
import { Sheet } from '../shell/Sheet.tsx';

const INPUT = 'w-full min-h-11 rounded-control border border-line-strong bg-inset px-3 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-accent-glow';

/** Video library L22 (mounted per open, so "now" is the moment it opens): when (default now), an optional link and note; the server validates (https, ≤ 500, not in the future). */
export function MarkUploadedSheet({ platform, onClose, onSave }: {
  platform: Platform | null; onClose: () => void; onSave: (p: Platform, b: { uploadedAt: string; url: string; note: string }) => Promise<string | null>;
}) {
  const [at, setAt] = useState(() => localNowInput());
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { setErr(null); onClose(); };
  const submit = async () => {
    if (!platform) return;
    const when = markTimeIso(at);
    if (!when.ok) { setErr(when.error); return; }
    setBusy(true);
    try {
      setErr(await onSave(platform, { uploadedAt: when.iso, url, note }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={platform !== null} onClose={close} title={platform ? `Mark as uploaded on ${PLATFORM_EN[platform]}` : 'Mark as uploaded'}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">When<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={INPUT} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">Link (optional)<input data-testid="mark-url" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} className={INPUT} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">Note (optional)<input data-testid="mark-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={INPUT} /></label>
        {err && <span role="alert" className="text-[13px] text-red">{err}</span>}
        <button type="button" data-testid="mark-save" disabled={busy} onClick={submit} className="min-h-11 rounded-control bg-ink text-[14px] font-medium text-canvas disabled:opacity-60">Save</button>
      </div>
    </Sheet>
  );
}
