import { STEP_LABELS, STEP_STATUS_LABEL, type RunView, type StepView } from '@videogen/shared/browser';
import { sourceLabel, stepDuration } from '../../lib/production-view.ts';
import { useNow } from '../../lib/use-now.ts';
import { StepMark } from '../thinking/ThinkingState.tsx';

function Mark({ s }: { s: StepView }) {
  if (s.status === 'running') return <StepMark tone="running" />;
  if (s.status === 'done') return <StepMark tone="normal" />;
  if (s.status === 'failed' || s.status === 'cancelled') return <StepMark tone="error" />;
  if (s.status === 'skipped') return <span aria-hidden className="block h-px w-3 shrink-0 bg-line-strong" />;
  return <span aria-hidden className={`size-3 shrink-0 rounded-full border-[1.5px] ${s.status.startsWith('waiting') ? 'border-ink-2 border-dashed' : 'border-line-strong'}`} />;
}

export function StepList({ run }: { run: RunView }) {
  const now = useNow(1000);
  return (
    <ol aria-label="Adımlar" className="flex flex-col gap-0.5">
      {run.steps.map((s) => {
        const dur = stepDuration(s, now);
        const detail = s.status === 'running' && s.progress > 0 ? `%${Math.round(s.progress)} · ${sourceLabel(s.progressSource)}` : '';
        return (
          <li key={s.id} data-testid="step" data-key={s.key} data-status={s.status} className="flex min-h-8 items-start gap-2.5 rounded-control px-1.5 py-1.5">
            <span className="mt-[3px] flex w-3.5 justify-center"><Mark s={s} /></span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-[13px]">
                <span className={s.status === 'pending' || s.status === 'skipped' ? 'text-ink-3' : 'font-medium text-ink'}>{STEP_LABELS[s.key]}</span>
                <span className="text-[12px] text-ink-3">{STEP_STATUS_LABEL[s.status]}</span>
                {detail && <span className="text-[12px] tabular-nums text-ink-2">{detail}</span>}
                <span className="ml-auto text-[12px] tabular-nums text-ink-3">{dur}</span>
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
