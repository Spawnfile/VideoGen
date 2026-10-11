import type { RunView, StepView } from '@videogen/shared/browser';
import { STEP_EN, STEP_STATUS_EN } from '../../lib/i18n.ts';
import { sourceLabel, stepDuration } from '../../lib/production-view.ts';
import { useNow } from '../../lib/use-now.ts';
import { StepMark } from '../thinking/ThinkingState.tsx';

function Mark({ s }: { s: StepView }) {
  if (s.status === 'running') return <StepMark tone="running" />;
  if (s.status === 'done') return <StepMark tone="normal" />;
  if (s.status === 'failed') return <StepMark tone="error" />;
  // Stopped is not a failure (spec E3): a dim cross.
  if (s.status === 'cancelled') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-dim)" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="shrink-0">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  if (s.status === 'skipped') return <span aria-hidden className="block h-px w-3 shrink-0 bg-dim" />;
  return <span aria-hidden className={`size-3 shrink-0 rounded-full border-[1.5px] ${s.status.startsWith('waiting') ? 'border-amber border-dashed' : 'border-line-strong'}`} />;
}

export function StepList({ run }: { run: RunView }) {
  const now = useNow(1000);
  return (
    <ol aria-label="Steps" className="flex flex-col gap-0.5">
      {run.steps.map((s) => {
        const dur = stepDuration(s, now);
        const detail = s.status === 'running' && s.progress > 0 ? `${Math.round(s.progress)}% · ${sourceLabel(s.progressSource)}` : '';
        return (
          <li key={s.id} id={`step-${s.id}`} data-testid="step" data-key={s.key} data-status={s.status} className="flex min-h-8 items-start gap-2.5 rounded-control px-1.5 py-1.5">
            <span className="mt-[3px] flex w-3.5 justify-center"><Mark s={s} /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className={s.status === 'pending' || s.status === 'skipped' ? 'text-ink-3' : 'font-medium text-ink'}>{STEP_EN[s.key] ?? s.key}</span>
                <span className="text-[12px] text-ink-3">{STEP_STATUS_EN[s.status]}</span>
                {detail && <span className="font-mono text-[11.5px] tabular-nums text-ink-2">{detail}</span>}
                <span className="ml-auto font-mono text-[11.5px] tabular-nums text-ink-3">{dur}</span>
              </p>
              {(s.note || s.error) && (
                <p className={`mt-0.5 text-[12px] leading-relaxed ${s.status === 'failed' ? 'text-red/80' : 'text-ink-2'}`}>{s.status === 'failed' ? s.error : s.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
