import { useState } from 'react';
import { CAPTION_MAX, YOUTUBE_TITLE_MAX, type VideoView } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';

const INPUT = 'w-full rounded-control border border-line-strong bg-inset px-3 py-2 text-[14px] focus-visible:outline-2 focus-visible:outline-accent-glow';

function useCopy(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  return [copied, async (text) => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }];
}

function Field({ label, testid, value, max, multiline, onSave }: { label: string; testid: string; value: string | null; max: number; multiline: boolean; onSave: (v: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [copied, copy] = useCopy();
  const save = async () => { const e = await onSave(draft); setErr(e); if (!e) setEditing(false); };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <span className="text-[12px] text-ink-3">{label}</span>
        <button type="button" data-testid={`copy-${testid}`} disabled={!value} onClick={() => value && copy(value)} className="ml-auto min-h-9 px-2 text-[13px] text-accent-glow disabled:text-ink-3">{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" data-testid={`edit-${testid}-toggle`} onClick={() => { setDraft(value ?? ''); setErr(null); setEditing(!editing); }} className="min-h-9 px-2 text-[13px] text-ink-2">{editing ? 'Cancel' : 'Edit'}</button>
      </div>
      {editing ? (
        <>
          {multiline
            ? <textarea data-testid={`edit-${testid}`} aria-label={label} value={draft} maxLength={max} rows={6} onChange={(e) => setDraft(e.target.value)} className={INPUT} />
            : <input data-testid={`edit-${testid}`} aria-label={label} value={draft} maxLength={max} onChange={(e) => setDraft(e.target.value)} className={`${INPUT} min-h-11`} />}
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="tabular-nums">{draft.length}/{max}</span>
            <button type="button" data-testid={`save-${testid}`} onClick={save} className="ml-auto min-h-9 rounded-control bg-accent px-3 text-[13px] text-white">Save</button>
          </div>
          {err && <span role="alert" className="text-[12px] text-red">{err}</span>}
        </>
      ) : (
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{value ?? <span className="text-ink-3">Empty</span>}</p>
      )}
    </div>
  );
}

/** Video library L12/L22: the texts pasted into the platform apps, and the attribution lines a reused CC-BY asset requires. */
export function VideoText({ video, attributions }: { video: VideoView; attributions: string[] }) {
  const [copied, copy] = useCopy();
  const save = (field: 'caption' | 'youtubeTitle') => async (v: string) => {
    const r = await api.setText(video.id, { [field]: v });
    return r.ok ? null : r.error;
  };
  return (
    <section aria-label="Caption" className="flex flex-col gap-4 rounded-card bg-paper p-4">
      <Field label="Caption (all platforms)" testid="caption" value={video.caption} max={CAPTION_MAX} multiline onSave={save('caption')} />
      <Field label="YouTube title" testid="title" value={video.youtubeTitle} max={YOUTUBE_TITLE_MAX} multiline={false} onSave={save('youtubeTitle')} />
      {attributions.length > 0 && (
        <div data-testid="attributions" className="flex flex-col gap-1">
          <div className="flex items-center">
            <span className="text-[12px] text-ink-3">Required credits — add them to every caption</span>
            <button type="button" onClick={() => copy(attributions.join('\n'))} className="ml-auto min-h-9 px-2 text-[13px] text-accent-glow">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          {attributions.map((l) => <p key={l} className="text-[13px] text-ink-2">{l}</p>)}
        </div>
      )}
    </section>
  );
}
