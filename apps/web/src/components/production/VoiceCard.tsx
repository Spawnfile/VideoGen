import { useQuery } from '@tanstack/react-query';
import type { VoiceTrack } from '@videogen/shared/browser';
import { api, blobUrl } from '../../lib/api.ts';
import { voiceView } from '../../lib/production-view.ts';
import { useContent } from './ArtifactCards.tsx';

const card = 'rounded-card border border-line/60 bg-paper px-4 py-3 shadow-subtle';
const chip = 'rounded-full bg-inset px-2.5 py-0.5 text-[12px] text-ink';

/** Spec §13.1 Seslendirme card (M5c): engine and voice, the provisional K17 mark, the track's facts, the stem to listen to and one row per line. */
export function VoiceCard({ trackId, stemSha }: { trackId: string | null; stemSha: string | null }) {
  const { data: track } = useContent<VoiceTrack>(trackId);
  const narrator = useQuery({ queryKey: ['narrator-voice'], queryFn: api.narratorVoice });
  // The chip reflects the CURRENT setting (not what the track was made with); it also stays on while the setting loads or fails: K17 is never shown as final by accident.
  const v = voiceView(track ?? null, { chosen: narrator.data?.chosen ?? false });
  if (!v) return null;
  return (
    <section data-testid="voice-card" aria-label="Seslendirme" className={card}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[14px] font-medium">{v.title}</h3>
        {v.provisional && <span className={chip}>GEÇİCİ (K17)</span>}
        {v.aigc && <span className={chip}>AI etiketi zorunlu</span>}
      </div>
      <p className="mt-1 text-[12.5px] tabular-nums text-ink-2">
        {v.lines} satır · {v.duration} · en kötü CER {v.worstCer} · ilk kelime {v.firstWord} · {v.pace}
      </p>
      {stemSha && <audio controls preload="metadata" data-testid="voice-audio" src={blobUrl(stemSha)} aria-label="Seslendirme dinle" className="mt-2 w-full" />}
      <ol aria-label="Seslendirme satırları" className="mt-2 flex flex-col gap-1">
        {v.rows.map((r) => (
          <li key={r.beat} className="grid grid-cols-[96px_1fr_auto] gap-2 text-[12.5px]">
            <span className="truncate text-ink-3" title={r.beat}>{r.beat}</span>
            <span>{r.text}</span>
            <span className={`tabular-nums ${r.warn ? 'font-medium text-ink' : 'text-ink-3'}`} title={r.warn ? 'CER %3 üstünde' : undefined}>{r.cer}{r.warn && <span aria-label="CER %3 üstünde"> !</span>}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
