import { useMemo, useState } from 'react';
import type { TraceRow } from '@videogen/shared/browser';
import { blockLabels, buildBlocks, type TraceBlock, withoutAnswer } from '../../lib/trace-view.ts';
import ThinkingState from './ThinkingState.tsx';

const MAX_ROWS = 200; // spec §12.4: long traces stay light (full virtual scrolling is M7, S8)
const size = (b: TraceBlock) => (b.kind === 'text' ? 1 : b.rows.length);

function Blocks({ blocks, showText }: { blocks: TraceBlock[]; showText: boolean }) {
  return (
    <>
      {blocks.map((b) =>
        b.kind === 'text' ? (
          showText && b.text ? (
            <p key={b.key} className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink" data-testid="trace-text">
              {b.text}
              {b.live && <span aria-hidden className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-ink-2" style={{ animation: 'fade-in 600ms ease-in-out infinite alternate' }} />}
            </p>
          ) : null
        ) : (
          <ThinkingState
            key={b.key}
            variant={b.variant}
            status={b.live ? 'live' : 'settled'}
            rows={b.rows}
            {...blockLabels(b)}
            renderDetail={(row) =>
              row.children ? (
                <div className="flex flex-col gap-2 border-l border-line pl-3">
                  {row.detail && <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">{row.detail}</p>}
                  <Blocks blocks={row.children} showText={false} />
                </div>
              ) : undefined
            }
          />
        ),
      )}
    </>
  );
}

/** `answered`: the turn's reply is shown as a chat message, so its final text block is left out (earlier prose stays). */
export function TraceView({ rows, answered = false }: { rows: TraceRow[]; answered?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const blocks = useMemo(() => (answered ? withoutAnswer(buildBlocks(rows)) : buildBlocks(rows)), [rows, answered]);
  const { visible, hidden } = useMemo(() => {
    if (showAll) return { visible: blocks, hidden: 0 };
    let n = 0;
    let i = blocks.length;
    while (i > 0 && n + size(blocks[i - 1]!) <= MAX_ROWS) n += size(blocks[--i]!);
    return { visible: blocks.slice(i), hidden: blocks.slice(0, i).reduce((s, b) => s + size(b), 0) };
  }, [blocks, showAll]);
  return (
    <div className="flex flex-col gap-2">
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="w-fit rounded-control px-1.5 py-1 text-[12px] text-ink-2 hover:bg-hover-2 hover:text-ink">
          Önceki {hidden} satırı göster
        </button>
      )}
      <Blocks blocks={visible} showText />
    </div>
  );
}
