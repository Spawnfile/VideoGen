import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ArtifactMeta, ProductResearch, RunView, VersionView, VideoStatus } from '@videogen/shared/browser';
import { DetailTabs, type DetailTab } from '../components/library/DetailTabs.tsx';
import { VersionList } from '../components/library/VersionList.tsx';
import { PlatformsPanel } from '../components/platforms/PlatformsPanel.tsx';
import { ResearchCard, StoryboardCard, useContent } from '../components/production/ArtifactCards.tsx';
import { DraftTabs } from '../components/production/DraftTabs.tsx';
import { ReviewPanel } from '../components/production/ReviewPanel.tsx';
import { VideoHeader } from '../components/production/VideoHeader.tsx';
import { api } from '../lib/api.ts';
import { finished, versionLabel } from '../lib/compare-view.ts';
import { panelView, pickDraft, pickFinal, pickReviewSheet, type FinalPick } from '../lib/production-view.ts';
import { latestRunOf, pickStudioVideo, pipeline, seedRuns, seedVideos, useStore } from '../lib/stores.ts';
import { useShellBar } from '../components/shell/ShellContext.tsx';
import { Audit } from './Audit.tsx';

const card = 'rounded-card bg-paper px-4 py-3';
const chip = (on: boolean) =>
  `min-h-8 rounded-full px-3 py-0.5 text-[12px] transition-colors md:min-h-0 md:px-2.5 duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow ${on ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;
const newest = (list: ArtifactMeta[], kind: string, runId: string | null) => (list.find((a) => a.kind === kind && (!runId || a.runId === runId)) ?? list.find((a) => a.kind === kind))?.id ?? null;

/** "Review'lar": a version picker (all rounds of the latest run, or one version's rounds) over the review panel and its round chips. */
function ReviewsTab({ videoId, versions, run, status, artifacts }: { videoId: string; versions: VersionView[]; run: RunView | null; status: VideoStatus; artifacts: ArtifactMeta[] }) {
  const [versionId, setVersionId] = useState<string | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const version = versions.find((v) => v.id === versionId) ?? null;
  const q = useQuery({
    queryKey: ['reviews', videoId, 'version', versionId, status],
    queryFn: () => (versionId ? api.versionReviews(videoId, versionId) : api.reviews(videoId)),
  });
  const runId = version?.runId ?? run?.id ?? null;
  const panel = useMemo(() => panelView(q.data ?? [], runId, round) ?? panelView(q.data ?? [], runId), [q.data, runId, round]);
  const sheet = panel ? pickReviewSheet(artifacts, panel.runId, panel.round) : null;
  const choose = (id: string | null) => { setVersionId(id); setRound(null); };
  return (
    <>
      {versions.length > 1 && (
        <div role="group" aria-label="Version" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[12px] text-ink-3">Version</span>
          <button type="button" aria-pressed={versionId === null} onClick={() => choose(null)} className={chip(versionId === null)}>all</button>
          {versions.map((v) => (
            <button key={v.id} type="button" aria-pressed={versionId === v.id} onClick={() => choose(v.id)} className={chip(versionId === v.id)}>{versionLabel(v)}</button>
          ))}
        </div>
      )}
      {q.isSuccess && !panel && <p className="text-[13px] text-ink-2">{version ? `${versionLabel(version)} has no review round.` : 'No final review yet.'}</p>}
      <ReviewPanel reviews={q.data ?? []} runId={runId} status={status} sheetSha={sheet} canSeek={false} failed={q.isError} round={round} onRound={setRound} />
    </>
  );
}

/** "Araştırma ve kaynaklar": the research card, then every claim with its sources (quote, link, access date). */
function ResearchTab({ artifactId }: { artifactId: string | null }) {
  const { data: r } = useContent<ProductResearch>(artifactId);
  if (!artifactId) return <p className="text-[13px] text-ink-2">No research.</p>;
  return (
    <>
      <ResearchCard artifactId={artifactId} />
      {r && r.claims.length > 0 && (
        <section aria-label="Claims and sources" data-testid="claims" className={card}>
          <h3 className="text-[14px] font-medium">Claims and sources</h3>
          <ol className="mt-2 flex flex-col gap-3">
            {r.claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <span className="text-[13px]">{c.text_tr}</span>
                <ul className="flex flex-col gap-1 pl-3">
                  {c.sources.map((s, i) => (
                    <li key={`${c.id}-${i}`} className="text-[12.5px] leading-relaxed text-ink-2">
                      <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-accent-glow underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent-glow">{s.url}</a>
                      <span className="text-ink-3"> · {s.type === 'primary' ? 'primary' : 'independent'} · {s.accessed_at.slice(0, 10)}</span>
                      <span className="block">“{s.quote}”</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

/** Plan M7 Y7 library detail page `/library/<videoId>`: Sürümler · Review'lar · Storyboard · Araştırma ve kaynaklar · Audit · Yayın. */
export function LibraryDetail({ videoId, go }: { videoId: string; go: (url: string) => void }) {
  const state = useStore(pipeline);
  const video = state.videos[videoId]?.value;
  const run = latestRunOf(state, videoId);
  const doneSteps = run?.steps.filter((s) => s.status === 'done').length ?? 0;
  const detail = useQuery({
    queryKey: ['video', videoId, run?.id ?? null, doneSteps], // per run: two runs of one video must not share a cache entry
    queryFn: async () => { const r = await api.video(videoId); seedVideos([r.data.video], r.eventId); seedRuns(r.data.runs, r.eventId); return r.data.artifacts; },
  });
  const versions = useQuery({ queryKey: ['versions', videoId, doneSteps, video?.status], queryFn: () => api.versions(videoId) });
  // Video library L22: imported videos and phones open on Platforms (watch → save → mark); the choice sticks once the user picks a tab.
  const [picked, setTab] = useState<DetailTab | null>(null);
  const tab: DetailTab = picked ?? (video?.origin === 'import' || window.matchMedia('(max-width: 599px)').matches ? 'platforms' : 'versions');
  const imported = video?.origin === 'import';
  const importedNote = <p className="text-[13px] text-ink-2">Imported: made outside the pipeline, so there is nothing here.</p>;
  const openInStudio = () => { pickStudioVideo(videoId); go(`/?video=${videoId}`); };
  useShellBar({
    title: video?.productName ?? 'Library',
    back: { label: 'Library', onBack: () => go('/library') },
    action: <button type="button" onClick={openInStudio} className="min-h-9 shrink-0 rounded-full border border-line-strong px-3 text-[12px] text-ink-2">Open in Studio</button>,
  }, [video?.productName, videoId]);
  const [selected, setSelected] = useState<string | null>(null);
  const list = detail.data ?? [];
  const vs = versions.data ?? [];
  const done = finished(vs);
  // The player shows the picked version's final; by default the best, else the newest finished one, else the latest run's final.
  const chosen = done.find((v) => v.id === selected) ?? done.find((v) => v.best) ?? done.at(-1) ?? null;
  const runFinal = pickFinal(list, run?.id ?? null);
  const final: FinalPick = chosen?.finals ? { musicSha: chosen.finals.musicSha, tiktokSha: chosen.finals.tiktokSha, coverSha: chosen.finals.coverSha, qcId: null } : runFinal;
  const draft = pickDraft(list, run?.id ?? null);

  if (detail.isError && !video) {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col gap-3 px-4 py-6 md:p-8">
        <p className="text-[13px] text-ink-2">This video was not found.</p>
        <button type="button" onClick={() => go('/library')} className="min-h-10 w-fit text-[13px] text-accent-glow hover:underline">Back to the Library</button>
      </div>
    );
  }
  return (
    <div data-testid="library-detail" className="mx-auto flex max-w-[900px] flex-col gap-5 px-4 pt-2 pb-8 md:p-8">
      <div className="hidden items-center gap-3 md:flex">
        <a href="/library" onClick={(e) => { e.preventDefault(); go('/library'); }} className="text-[12.5px] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-glow">← Library</a>
        <button
          type="button"
          data-testid="open-in-studio"
          onClick={openInStudio}
          className="ml-auto rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow"
        >
          Open in Studio
        </button>
      </div>
      {video && <VideoHeader video={video} run={run} />}
      <DetailTabs tab={tab} onTab={setTab}>
        {tab === 'versions' && (
          <>
            <DraftTabs key={`${final.musicSha ?? ''}${draft.videoSha ?? 'none'}`} pick={draft} final={final} versions={vs} />
            {chosen && <p className="text-[12px] text-ink-3">In the player: {versionLabel(chosen)}</p>}
            <VersionList versions={vs} selected={chosen?.id ?? null} onSelect={setSelected} />
            {versions.isSuccess && vs.length === 0 && <p className="text-[13px] text-ink-2">No versions.</p>}
          </>
        )}
        {tab === 'platforms' && video && <PlatformsPanel video={video} />}
        {imported && (tab === 'reviews' || tab === 'storyboard' || tab === 'research') && importedNote}
        {!imported && tab === 'reviews' && video && <ReviewsTab videoId={videoId} versions={vs} run={run} status={video.status} artifacts={list} />}
        {!imported && tab === 'storyboard' && (newest(list, 'storyboard', run?.id ?? null)
          ? <StoryboardCard artifactId={newest(list, 'storyboard', run?.id ?? null)} />
          : <p className="text-[13px] text-ink-2">No storyboard.</p>)}
        {!imported && tab === 'research' && <ResearchTab artifactId={newest(list, 'research', run?.id ?? null)} />}
        {tab === 'audit' && <Audit embedded initial={{ videoId }} fixed={['videoId']} />}
      </DetailTabs>
    </div>
  );
}
