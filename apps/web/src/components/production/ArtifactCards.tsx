import { useQuery } from '@tanstack/react-query';
import { DRAFT_CHECKS, draftDecision, formatClock, type BuildReport, type DraftSeverity, type ProductResearch, type Review, type SceneSpec, type Storyboard, type VideoView } from '@videogen/shared/browser';
import { api, blobUrl } from '../../lib/api.ts';
import { recommendationLine } from '../../lib/brief-view.ts';
import { buildFacts } from '../../lib/production-view.ts';
import { DRAFT_CHECK_EN, HOOK_PATTERN_EN, SEVERITY_EN } from '../../lib/i18n.ts';

const DIFFICULTY: Record<ProductResearch['difficulty'], string> = { procedural: 'can be modelled procedurally', needs_asset: 'needs a ready-made 3D asset', too_hard: 'cannot be modelled' };
const card = 'rounded-card bg-paper px-4 py-3';

export function useContent<T>(id: string | null) {
  return useQuery({ queryKey: ['artifact', id], enabled: !!id, staleTime: Number.POSITIVE_INFINITY, queryFn: async () => (await api.artifact(id!)).content as T });
}

export function ResearchCard({ artifactId, video }: { artifactId: string | null; video?: Pick<VideoView, 'duration' | 'durationSource'> }) {
  const { data: r } = useContent<ProductResearch>(artifactId);
  if (!r) return null;
  return (
    <section data-testid="research-card" aria-label="Research" className={card}>
      <h3 className="text-[14px] font-medium">Research</h3>
      <p className="mt-1 text-[13px] text-ink-2">{r.interpretation} · {DIFFICULTY[r.difficulty]}</p>
      {r.difficulty === 'too_hard' && r.difficulty_reason_tr && <p className="mt-2 text-[13px] leading-relaxed">{r.difficulty_reason_tr}</p>}
      {r.parts.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {[...r.parts].sort((a, b) => a.assembly_order - b.assembly_order).map((p) => (
            <li key={p.id} title={`${p.material} · ${p.function}`} className="rounded-full bg-inset px-2.5 py-0.5 text-[12px]">{p.name_tr}{p.count > 1 ? ` ×${p.count}` : ''}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{r.mechanism.summary_tr}</p>
      <p className="mt-1 text-[12px] text-ink-3">{r.claims.length} sourced claims</p>
      {r.recommendation && (
        <div data-testid="agent-recommendation" className="mt-3 border-t border-line/60 pt-2 text-[12.5px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">{recommendationLine(r.recommendation)}</p>
          {r.recommendation.brief_tr.length > 0 && (
            <ul className="mt-1 list-disc pl-5">{r.recommendation.brief_tr.map((b) => <li key={b}>{b}</li>)}</ul>
          )}
          <p className="mt-1 text-ink-3">{r.recommendation.reason_tr} · Your brief takes priority over these suggestions.</p>
        </div>
      )}
    </section>
  );
}

export function StoryboardCard({ artifactId }: { artifactId: string | null }) {
  const { data: s } = useContent<Storyboard>(artifactId);
  if (!s) return null;
  return (
    <section data-testid="storyboard-card" aria-label="Storyboard" className={card}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[14px] font-medium">Storyboard</h3>
        <span className="text-[12px] text-ink-3">{s.duration_s} s · {s.beats.length} beats · {HOOK_PATTERN_EN[s.hook.pattern]}</span>
      </div>
      <p className="mt-1 text-[14px]">“{s.hook.text_tr}”</p>
      <ol className="mt-2 flex flex-col gap-1">
        {s.beats.map((b) => (
          <li key={b.id} className="grid grid-cols-[64px_1fr] gap-2 text-[12.5px]">
            <span className="tabular-nums text-ink-3">{b.t_start}–{b.t_end} s</span>
            <span><span className="text-ink">{b.onscreen_text.tr}</span>{b.vo_text && <span className="block text-ink-2">{b.vo_text.tr}</span>}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function BuildCard({ reportId, sceneId, sheetSha }: { reportId: string | null; sceneId: string | null; sheetSha: string | null }) {
  const { data: report } = useContent<BuildReport>(reportId);
  const { data: scene } = useContent<SceneSpec>(sceneId);
  if (!report) return null;
  const f = buildFacts(report, scene);
  return (
    <section data-testid="build-card" aria-label="Scene" className={card}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[14px] font-medium">Scene</h3>
        <span className="text-[12px] text-ink-3">{f.line}</span>
      </div>
      {sheetSha && (
        <img
          src={blobUrl(sheetSha)}
          alt="Preview frames: the first frame and the middle of each beat; red areas are covered by the TikTok interface"
          loading="lazy"
          className="mt-3 w-full rounded-input border border-line/60 bg-inset"
        />
      )}
      {f.warnings.length > 0 && (
        <ul aria-label="Build warnings" className="mt-2 flex flex-col gap-1 text-[12.5px] text-ink-2">
          {f.warnings.map((w) => <li key={w}>· {w}</li>)}
        </ul>
      )}
    </section>
  );
}

const SEVERITY: Record<DraftSeverity, string> = SEVERITY_EN as Record<DraftSeverity, string>;

/** Spec §13.1 review findings with their frame time (M4c: the draft review; reviews/findings tables arrive in M5). */
export function ReviewCard({ artifactId }: { artifactId: string | null }) {
  const { data: r } = useContent<Review>(artifactId);
  if (!r) return null;
  const pass = draftDecision(r).verdict === 'pass';
  const failed = r.checks.filter((c) => !c.pass);
  return (
    <section data-testid="review-card" aria-label="Draft review" className={card}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[14px] font-medium">Draft review</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${pass ? 'bg-green/10 text-green' : 'bg-inset text-ink'}`}>{pass ? 'passed' : 'sent back for a fix'}</span>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.summary_tr}</p>
      {failed.length > 0 && (
        <ul aria-label="Findings" className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
          {failed.map((c) => (
            <li key={c.id}>
              <span className="font-medium">{DRAFT_CHECK_EN[c.id] ?? c.id}</span>
              <span className="tabular-nums text-ink-3"> · {SEVERITY[DRAFT_CHECKS[c.id].severity]}{c.evidence ? ` · ${formatClock(c.evidence.timecode)}` : ''}</span>
              {c.fix_hint && <span className="block text-ink-2">{c.fix_hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
