import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { BlockVariant, ThinkingRowView } from '../../lib/trace-view.ts';

/* ─────────────────────────────────────────────────────────
 * THINKING — expandable agent trace, four variants
 *
 *   Steps      step list with spinner → muted checks
 *   Reasoning  prose reasoning that expands, then settles
 *   Search     web-search trace: query + sources read
 *   Coding     tool trace: files read, edits, commands
 *
 * The user's original component (docs/m3/thinking-state.original.tsx), made live per spec §13.2: no timer sequence,
 * rows grow with the stream, status live → settled, open while live, closed when settled unless toggled by hand.
 * ───────────────────────────────────────────────────────── */

const ACTIVE: Record<BlockVariant, string> = { steps: 'Adımlar sürüyor', reasoning: 'Düşünüyor', search: "Web'de arıyor", coding: 'Araç çalıştırıyor' };
const DONE: Record<BlockVariant, string> = { steps: 'Adımlar tamamlandı', reasoning: 'Düşündü', search: "Web'de arandı", coding: 'Araçlar çalıştı' };
// Spec §13.3: the original orange/green search dots become ink tones.
const TONES = ['bg-ink-2', 'bg-ink-3', 'bg-line-strong'];

function Dot({ tone }: { tone: string }) {
  return (
    <span className={`flex size-3.5 shrink-0 items-center justify-center rounded-full text-white ${tone}`}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    </span>
  );
}

export function StepMark({ tone }: { tone: ThinkingRowView['tone'] }) {
  if (tone === 'running') return <span className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2" style={{ animation: 'spin 700ms linear infinite' }} />;
  if (tone === 'denied' || tone === 'error') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-red)" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 opacity-80">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export interface ThinkingStateProps {
  variant: BlockVariant;
  status: 'live' | 'settled';
  rows: ThinkingRowView[];
  active?: string;
  done?: string;
  /** override the header glyph (defaults to the sparkle) */
  icon?: ReactNode;
  defaultExpanded?: boolean;
  /** let embedders sequence content after the trace settles */
  onSettled?: () => void;
  /** Rendered under a selected row (a subagent's nested trace, a guard reason). */
  renderDetail?: (row: ThinkingRowView) => ReactNode;
}

export default function ThinkingState({ variant, status, rows, active, done, icon, defaultExpanded = false, onSettled, renderDetail }: ThinkingStateProps) {
  const working = status === 'live';
  const labelId = useId();
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const autoExpanded = working || defaultExpanded;
  const expanded = manualExpanded ?? autoExpanded;
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [rows, expanded, selected]);

  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working) onSettled?.();
    wasWorking.current = working;
  }, [working, onSettled]);

  const label = working ? (active ?? ACTIVE[variant]) : (done ?? DONE[variant]);
  let resultIndex = 0;

  return (
    <div className="flex w-full flex-col" data-testid="thinking" data-variant={variant} data-status={status}>
      {/* header — shared across variants */}
      <button
        type="button"
        aria-expanded={expanded}
        // The label sits in a role=status live region, which does not give the button a name from content.
        aria-labelledby={labelId}
        onClick={() => setManualExpanded((current) => !(current ?? autoExpanded))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {icon ? (
          <span className="flex shrink-0 transition-colors duration-200" style={{ color: working ? 'var(--color-ink-2)' : 'var(--color-ink-3)' }}>{icon}</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill={working ? 'var(--color-ink-2)' : 'var(--color-ink-3)'} aria-hidden>
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        )}
        <span id={labelId} role="status" className="contents">
          {working ? (
            <span
              className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, var(--color-ink-3) 35%, var(--color-ink) 50%, var(--color-ink-3) 65%)', backgroundSize: '200% 100%', animation: 'shimmer-text 1.4s linear infinite' }}
            >
              {label}
            </span>
          ) : (
            <span className="text-[13px] font-medium whitespace-nowrap text-ink-2" style={{ animation: 'fade-in 350ms ease-out both' }}>{label}</span>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* expandable trace */}
      <div className="grid transition-[grid-template-rows,opacity] duration-400" style={{ gridTemplateRows: expanded ? '1fr' : '0fr', opacity: expanded ? 1 : 0, transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)' }}>
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span aria-hidden className="absolute left-[3px] w-px bg-line" style={{ top: -8, height: lineHeight ? lineHeight - 2 : 0, transition: 'height 500ms cubic-bezier(0.23,1,0.32,1)' }} />
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              {rows.map((row) => {
                const animation = { animation: 'fade-up 320ms cubic-bezier(0.23,1,0.32,1) both' };
                const rowClass = 'flex min-h-7 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left';
                const isSelected = selected === row.id;
                const hasDetail = !!(row.detail || row.children);
                const flag = row.tone === 'denied' ? 'reddedildi' : row.tone === 'error' ? 'hata' : null;

                if (row.kind === 'query') {
                  return (
                    <div key={row.id} className="flex h-6 items-center gap-2 px-1.5" style={animation}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth="2" strokeLinecap="round" className="shrink-0" aria-hidden>
                        <circle cx="11" cy="11" r="7" />
                        <path d="M21 21l-4.3-4.3" />
                      </svg>
                      <span className="min-w-0 truncate text-[12.5px] text-ink-2">{row.primary}</span>
                      {flag && <span className="shrink-0 text-[11.5px] text-red/80">{flag}</span>}
                    </div>
                  );
                }

                if (row.kind === 'result' || row.kind === 'item') {
                  const dot = TONES[resultIndex++ % TONES.length]!;
                  const inner = (
                    <>
                      <Dot tone={dot} />
                      <span className="min-w-0 truncate text-[12.5px] font-medium text-ink">{row.primary}</span>
                      {row.secondary && <span className="shrink-0 text-[11.5px] text-ink-3">{row.secondary}</span>}
                    </>
                  );
                  return row.href ? (
                    <a key={row.id} href={row.href} target="_blank" rel="noreferrer" className={`${rowClass} transition-colors duration-150 hover:bg-hover [&:hover>span:nth-child(2)]:underline`} style={animation}>{inner}</a>
                  ) : (
                    <div key={row.id} className={rowClass} style={animation}>{inner}</div>
                  );
                }

                if (row.kind === 'text') {
                  return (
                    <p key={row.id} className="px-1.5 py-0.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2" style={animation}>{row.primary}</p>
                  );
                }

                const content = (
                  <>
                    {variant === 'steps' && <StepMark tone={row.tone} />}
                    <span className="min-w-0 truncate text-[12.5px] font-medium text-ink">{row.primary}</span>
                    {row.secondary && <span className={`min-w-0 truncate text-[11.5px] text-ink-3 ${row.mono ? 'font-mono' : ''}`}>{row.secondary}</span>}
                    {row.add !== undefined && (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums">
                        <span className="text-green">+{row.add}</span> <span className="text-red">−{row.del ?? 0}</span>
                      </span>
                    )}
                    {flag && <span className="shrink-0 text-[11.5px] text-red/80">{flag}</span>}
                    {variant === 'coding' && row.tone === 'running' && <span className="size-2.5 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2" style={{ animation: 'spin 700ms linear infinite' }} />}
                  </>
                );
                return (
                  <div key={row.id} style={animation}>
                    {hasDetail ? (
                      <button type="button" aria-pressed={isSelected} onClick={() => setSelected(isSelected ? null : row.id)} className={`${rowClass} transition-colors duration-150 ${isSelected ? 'bg-inset' : 'hover:bg-hover'}`}>
                        {content}
                      </button>
                    ) : (
                      <div className={rowClass}>{content}</div>
                    )}
                    {isSelected && (
                      <div className="mt-1 mb-2 ml-1.5">
                        {renderDetail?.(row) ?? (row.detail && <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">{row.detail}</p>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
