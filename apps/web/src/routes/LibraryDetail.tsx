import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ArtifactMeta, ProductResearch, RunView, VersionView, VideoStatus } from '@videogen/shared/browser';
import { DetailTabs, type DetailTab } from '../components/library/DetailTabs.tsx';
import { VersionList } from '../components/library/VersionList.tsx';
import { ResearchCard, StoryboardCard, useContent } from '../components/production/ArtifactCards.tsx';
import { DraftTabs } from '../components/production/DraftTabs.tsx';
import { ReviewPanel } from '../components/production/ReviewPanel.tsx';
import { VideoHeader } from '../components/production/VideoHeader.tsx';
import { PublishPanel } from '../components/publish/PublishPanel.tsx';
import { api } from '../lib/api.ts';
import { finished, versionLabel } from '../lib/compare-view.ts';
import { panelView, pickDraft, pickFinal, pickReviewSheet, type FinalPick } from '../lib/production-view.ts';
import { latestRunOf, pipeline, seedRuns, seedVideos, useStore } from '../lib/stores.ts';
import { Audit } from './Audit.tsx';

const card = 'rounded-card border border-line/60 bg-paper px-4 py-3 shadow-subtle';
const chip = (on: boolean) =>
  `rounded-full px-2.5 py-0.5 text-[12px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${on ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;
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
        <div role="group" aria-label="Sürüm" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[12px] text-ink-3">Sürüm</span>
          <button type="button" aria-pressed={versionId === null} onClick={() => choose(null)} className={chip(versionId === null)}>tümü</button>
          {versions.map((v) => (
            <button key={v.id} type="button" aria-pressed={versionId === v.id} onClick={() => choose(v.id)} className={chip(versionId === v.id)}>{versionLabel(v)}</button>
          ))}
        </div>
      )}
      {q.isSuccess && !panel && <p className="text-[13px] text-ink-2">{version ? `${versionLabel(version)} için inceleme turu yok.` : 'Henüz final incelemesi yok.'}</p>}
      <ReviewPanel reviews={q.data ?? []} runId={runId} status={status} sheetSha={sheet} canSeek={false} failed={q.isError} round={round} onRound={setRound} />
    </>
  );
}

/** "Araştırma ve kaynaklar": the research card, then every claim with its sources (quote, link, access date). */
function ResearchTab({ artifactId }: { artifactId: string | null }) {
  const { data: r } = useContent<ProductResearch>(artifactId);
  if (!artifactId) return <p className="text-[13px] text-ink-2">Araştırma yok.</p>;
  return (
    <>
      <ResearchCard artifactId={artifactId} />
      {r && r.claims.length > 0 && (
        <section aria-label="İddialar ve kaynaklar" data-testid="claims" className={card}>
          <h3 className="text-[14px] font-medium">İddialar ve kaynaklar</h3>
          <ol className="mt-2 flex flex-col gap-3">
            {r.claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <span className="text-[13px]">{c.text_tr}</span>
                <ul className="flex flex-col gap-1 pl-3">
                  {c.sources.map((s, i) => (
                    <li key={`${c.id}-${i}`} className="text-[12.5px] leading-relaxed text-ink-2">
                      <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ink">{s.url}</a>
                      <span className="text-ink-3"> · {s.type === 'primary' ? 'birincil' : 'bağımsız'} · {s.accessed_at.slice(0, 10)}</span>
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
    queryKey: ['video', videoId, doneSteps],
    queryFn: async () => { const r = await api.video(videoId); seedVideos([r.data.video], r.eventId); seedRuns(r.data.runs, r.eventId); return r.data.artifacts; },
  });
  const versions = useQuery({ queryKey: ['versions', videoId, doneSteps, video?.status], queryFn: () => api.versions(videoId) });
  const [tab, setTab] = useState<DetailTab>('versions');
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
      <div className="mx-auto flex max-w-[900px] flex-col gap-3 p-8">
        <p className="text-[13px] text-ink-2">Video bulunamadı.</p>
        <button type="button" onClick={() => go('/library')} className="w-fit text-[13px] text-accent hover:underline">Kütüphaneye dön</button>
      </div>
    );
  }
  return (
    <div data-testid="library-detail" className="mx-auto flex max-w-[900px] flex-col gap-5 p-8">
      <div className="flex items-center gap-3">
        <a href="/library" onClick={(e) => { e.preventDefault(); go('/library'); }} className="text-[12.5px] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">← Kütüphane</a>
        <button
          type="button"
          data-testid="open-in-studio"
          onClick={() => go(`/?video=${videoId}`)}
          className="ml-auto rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink"
        >
          Stüdyo'da aç
        </button>
      </div>
      {video && <VideoHeader video={video} run={run} />}
      <DetailTabs tab={tab} onTab={setTab}>
        {tab === 'versions' && (
          <>
            <DraftTabs key={`${final.musicSha ?? ''}${draft.videoSha ?? 'none'}`} pick={draft} final={final} versions={vs} />
            {chosen && <p className="text-[12px] text-ink-3">Oynatıcıda: {versionLabel(chosen)}</p>}
            <VersionList versions={vs} selected={chosen?.id ?? null} onSelect={setSelected} />
            {versions.isSuccess && vs.length === 0 && <p className="text-[13px] text-ink-2">Sürüm yok.</p>}
          </>
        )}
        {tab === 'reviews' && video && <ReviewsTab videoId={videoId} versions={vs} run={run} status={video.status} artifacts={list} />}
        {tab === 'storyboard' && (newest(list, 'storyboard', run?.id ?? null)
          ? <StoryboardCard artifactId={newest(list, 'storyboard', run?.id ?? null)} />
          : <p className="text-[13px] text-ink-2">Storyboard yok.</p>)}
        {tab === 'research' && <ResearchTab artifactId={newest(list, 'research', run?.id ?? null)} />}
        {tab === 'audit' && <Audit embedded initial={{ videoId }} fixed={['videoId']} />}
        {tab === 'publish' && video && (video.status === 'ready' || video.status === 'published'
          ? <PublishPanel key={videoId} videoId={videoId} />
          : <p className="text-[13px] text-ink-2">Yayın için video hazır olmalı.</p>)}
      </DetailTabs>
    </div>
  );
}
