import type { MusicScore, VideoView } from '@videogen/shared/browser';
import { blobUrl } from '../../lib/api.ts';
import { stemFileName, type StemPick } from '../../lib/production-view.ts';
import { useContent } from './ArtifactCards.tsx';

const card = 'rounded-card bg-paper px-4 py-3';
const PARTS = [
  { key: 'music', label: 'Music', file: 'music' },
  { key: 'sfx', label: 'Sound effects', file: 'effects' },
] as const;

/**
 * Agent music design A5: the stems of the newest final (music at its mix level, the effects), each playable and
 * downloadable, and the score in a line.
 */
export function AudioCard({ video, stems }: { video: Pick<VideoView, 'id' | 'productName'>; stems: StemPick }) {
  const { data: score } = useContent<MusicScore>(stems.scoreId);
  const parts = PARTS.filter((p) => stems[p.key]);
  if (!parts.length && !score) return null;
  return (
    <section data-testid="audio-card" aria-label="Audio stems" className={card}>
      <h3 className="text-[14px] font-medium">Audio stems</h3>
      {score && (
        <p data-testid="music-score" className="mt-1 text-[12.5px] text-ink-2">
          Music: {score.key.root} {score.key.mode === 'minor' ? 'minor' : 'major'} · {score.bpm} BPM · {score.sections.length} sections · {score.intent_tr}
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
    </section>
  );
}
