import type { QcReport } from '@videogen/shared/browser';
import { qcLines } from '../../lib/production-view.ts';
import { useContent } from './ArtifactCards.tsx';

const card = 'rounded-card bg-paper px-4 py-3';

/** Spec §8.2 AUTO/MANIFEST result (plan E15): gates, the orchestrator's D6/D7 scores, failed checks with values. */
export function QcCard({ artifactId }: { artifactId: string | null }) {
  const { data: r } = useContent<QcReport>(artifactId);
  if (!r) return null;
  const l = qcLines(r);
  return (
    <section data-testid="qc-card" aria-label="Automatic checks" className={card}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[14px] font-medium">Automatic checks</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${r.pass ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>{r.pass ? 'passed' : 'failed'}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{l.gates}</p>
      <p className="text-[13px] tabular-nums text-ink-2">{l.scores}</p>
      {l.failures.length > 0 && (
        <ul aria-label="Check findings" className="mt-2 flex flex-col gap-1 text-[12.5px] tabular-nums text-ink-2">
          {l.failures.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
    </section>
  );
}
