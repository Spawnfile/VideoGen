import { useState } from 'react';
import type { MusicScore, VideoView } from '@videogen/shared/browser';
import { api, blobUrl } from '../../lib/api.ts';
import { stemFileName, type StemPick } from '../../lib/production-view.ts';
import { useContent } from './ArtifactCards.tsx';

const card = 'rounded-card bg-paper px-4 py-3';
const PARTS = [
  { key: 'music', label: 'Music', file: 'music' },
  { key: 'voice', label: 'Voiceover', file: 'voice' },
  { key: 'sfx', label: 'Sound effects', file: 'effects' },
] as const;
const EDIT_MAX = 1000;

/**
 * Agent music design A5/A6: the stems of the newest final (music at its mix level with ducking, the voice, the effects), each playable and
 * downloadable, the composer's score in a line, and the user's audio instruction to the agents (a new version; the picture is kept).
 */
export function AudioCard({ video, stems, canEdit }: { video: Pick<VideoView, 'id' | 'productName'>; stems: StemPick; canEdit: boolean }) {
  const { data: score } = useContent<MusicScore>(stems.scoreId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const parts = PARTS.filter((p) => stems[p.key]);
  if (!parts.length && !score && !msg) return null;
  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.audioEdit(video.id, value);
      if (r.ok) { setText(''); setMsg({ ok: true, text: 'Audio edit started: the composer rewrites the music from your note; the picture stays and a new version is made.' }); }
      else setMsg({ ok: false, text: r.error });
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-testid="audio-card" aria-label="Audio stems" className={card}>
      <h3 className="text-[14px] font-medium">Audio stems</h3>
      {score && (
        <p data-testid="music-score" className="mt-1 text-[12.5px] text-ink-2">
          Music by the composer agent: {score.key.root} {score.key.mode === 'minor' ? 'minor' : 'major'} · {score.bpm} BPM · {score.sections.length} sections · {score.intent_tr}
        </p>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {parts.map((p) => (
          <li key={p.key} data-testid={`stem-${p.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-full text-[13px] md:w-24">{p.label}</span>
            <audio controls preload="none" src={blobUrl(stems[p.key]!)} className="h-8 min-w-0 flex-1" />
            <a href={`${blobUrl(stems[p.key]!)}?download=${stemFileName(video.productName, p.file)}`} className="flex min-h-9 items-center text-[12.5px] text-accent-glow hover:underline">Download FLAC</a>
          </li>
        ))}
      </ul>
      {canEdit && (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="mt-3 flex flex-col gap-1.5 border-t border-line/60 pt-3">
          <label htmlFor="audio-edit" className="text-[13px] text-ink-2">Edit the audio with the agents</label>
          <textarea
            id="audio-edit"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={EDIT_MAX}
            rows={2}
            placeholder="e.g. calmer music, no drums; let it rise at the payoff; keep the music a little lower under the voiceover."
            className="resize-y rounded-input border border-line bg-inset px-3 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-ink-3 focus:border-accent-glow/50"
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || !text.trim()} className="rounded-control bg-ink px-3 py-1.5 text-[13px] font-medium text-canvas disabled:opacity-40">Send to the agents</button>
            <span className="text-[11.5px] tabular-nums text-ink-3">{text.length}/{EDIT_MAX}</span>
          </div>
        </form>
      )}
      {/* Outside the form: the form hides once the edit run starts, the note must stay. */}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-[12.5px] ${msg.ok ? 'text-ink-2' : 'text-red'}`}>{msg.text}</p>}
    </section>
  );
}
