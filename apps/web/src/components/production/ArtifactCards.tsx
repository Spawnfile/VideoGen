import { useQuery } from '@tanstack/react-query';
import { DRAFT_CHECKS, draftDecision, formatClock, HOOK_PATTERN_LABELS, type BuildReport, type DraftSeverity, type ProductResearch, type Review, type SceneSpec, type Storyboard } from '@videogen/shared/browser';
import { api, blobUrl } from '../../lib/api.ts';
import { buildFacts } from '../../lib/production-view.ts';

const DIFFICULTY: Record<ProductResearch['difficulty'], string> = { procedural: 'prosedürel modellenebilir', needs_asset: 'hazır 3D varlık gerekir', too_hard: 'modellenemiyor' };
const card = 'rounded-card border border-line/60 bg-paper px-4 py-3 shadow-subtle';

function useContent<T>(id: string | null) {
  return useQuery({ queryKey: ['artifact', id], enabled: !!id, staleTime: Number.POSITIVE_INFINITY, queryFn: async () => (await api.artifact(id!)).content as T });
}

export function ResearchCard({ artifactId }: { artifactId: string | null }) {
  const { data: r } = useContent<ProductResearch>(artifactId);
  if (!r) return null;
  return (
    <section data-testid="research-card" aria-label="Araştırma" className={card}>
      <h3 className="text-[14px] font-medium">Araştırma</h3>
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
      <p className="mt-1 text-[12px] text-ink-3">{r.claims.length} kaynaklı iddia</p>
    </section>
  );
}

export function StoryboardCard({ artifactId }: { artifactId: string | null }) {
  const { data: s } = useContent<Storyboard>(artifactId);
  if (!s) return null;
  return (
    <section data-testid="storyboard-card" aria-label="Storyboard" className={card}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[14px] font-medium">Storyboard</h3>
        <span className="text-[12px] text-ink-3">{s.duration_s} sn · {s.beats.length} vuruş · {HOOK_PATTERN_LABELS[s.hook.pattern]}</span>
      </div>
      <p className="mt-1 text-[14px]">“{s.hook.text_tr}”</p>
      <ol className="mt-2 flex flex-col gap-1">
        {s.beats.map((b) => (
          <li key={b.id} className="grid grid-cols-[64px_1fr] gap-2 text-[12.5px]">
            <span className="tabular-nums text-ink-3">{b.t_start}–{b.t_end} sn</span>
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
    <section data-testid="build-card" aria-label="Sahne" className={card}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[14px] font-medium">Sahne</h3>
        <span className="text-[12px] text-ink-3">{f.line}</span>
      </div>
      {sheetSha && (
        <img
          src={blobUrl(sheetSha)}
          alt="Önizleme kareleri: ilk kare ve vuruş ortaları; kırmızı bölgeler TikTok arayüzünün kapattığı alan"
          loading="lazy"
          className="mt-3 w-full rounded-input border border-line/60 bg-inset"
        />
      )}
      {f.warnings.length > 0 && (
        <ul aria-label="Build uyarıları" className="mt-2 flex flex-col gap-1 text-[12.5px] text-ink-2">
          {f.warnings.map((w) => <li key={w}>· {w}</li>)}
        </ul>
      )}
    </section>
  );
}

const SEVERITY: Record<DraftSeverity, string> = { blocker: 'engelleyici', major: 'önemli', minor: 'küçük' };

/** Spec §13.1 review findings with their frame time (M4c: the draft review; reviews/findings tables arrive in M5). */
export function ReviewCard({ artifactId }: { artifactId: string | null }) {
  const { data: r } = useContent<Review>(artifactId);
  if (!r) return null;
  const pass = draftDecision(r).verdict === 'pass';
  const failed = r.checks.filter((c) => !c.pass);
  return (
    <section data-testid="review-card" aria-label="Taslak incelemesi" className={card}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[14px] font-medium">Taslak incelemesi</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${pass ? 'bg-green/10 text-green' : 'bg-inset text-ink'}`}>{pass ? 'geçti' : 'düzeltmeye gönderildi'}</span>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.summary_tr}</p>
      {failed.length > 0 && (
        <ul aria-label="Bulgular" className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
          {failed.map((c) => (
            <li key={c.id}>
              <span className="font-medium">{DRAFT_CHECKS[c.id].label_tr}</span>
              <span className="tabular-nums text-ink-3"> · {SEVERITY[DRAFT_CHECKS[c.id].severity]}{c.evidence ? ` · ${formatClock(c.evidence.timecode)}` : ''}</span>
              {c.fix_hint && <span className="block text-ink-2">{c.fix_hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
