import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../../lib/api.ts';
import { panelView, pickDraft, pickFinal, pickReviewSheet, pickVoice } from '../../lib/production-view.ts';
import { latestRunOf, pipeline, seedRuns, seedVideos, useStore } from '../../lib/stores.ts';
import { BuildCard, ResearchCard, ReviewCard, StoryboardCard } from './ArtifactCards.tsx';
import { DraftTabs } from './DraftTabs.tsx';
import { QcCard } from './QcCard.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';
import { StepList } from './StepList.tsx';
import { VideoHeader } from './VideoHeader.tsx';
import { VoiceCard } from './VoiceCard.tsx';

export function ProductionPanel({ videoId }: { videoId: string | null }) {
  const state = useStore(pipeline);
  const video = videoId ? state.videos[videoId]?.value : undefined;
  const run = videoId ? latestRunOf(state, videoId) : null;
  // Artifacts appear as steps finish: the detail (views + artifact list) is refetched whenever another step is done.
  const doneSteps = run?.steps.filter((s) => s.status === 'done').length ?? 0;
  const detail = useQuery({
    queryKey: ['video', videoId, doneSteps],
    enabled: !!videoId,
    queryFn: async () => { const r = await api.video(videoId!); seedVideos([r.data.video], r.eventId); seedRuns(r.data.runs, r.eventId); return r.data.artifacts; },
  });
  // The final review rounds follow the same trigger (a round lands when the review step is done) and the video's status.
  const reviews = useQuery({ queryKey: ['reviews', videoId, doneSteps, video?.status], enabled: !!videoId, queryFn: () => api.reviews(videoId!) });
  const panel = useMemo(() => panelView(reviews.data ?? [], run?.id), [reviews.data, run?.id]);
  const sheet = useMemo(() => (panel ? pickReviewSheet(detail.data ?? [], panel.runId, panel.round) : null), [panel, detail.data]);
  const latest = useMemo(() => {
    const list = detail.data ?? [];
    const find = (kind: string) => list.find((a) => a.kind === kind && (!run || a.runId === run.id)) ?? null;
    const pick = (kind: string) => find(kind)?.id ?? null;
    return {
      research: pick('research'), storyboard: pick('storyboard'), report: pick('build_report'), scene: pick('scene'), sheet: find('preview_sheet')?.blobSha ?? null,
      ...pickVoice(list, run?.id ?? null), draft: pickDraft(list, run?.id ?? null), final: pickFinal(list, run?.id ?? null),
    };
  }, [detail.data, run]);

  if (!videoId) {
    return <p className="text-[13px] leading-relaxed text-ink-2">Üstteki alana bir ürün adı yazıp Üret'e basın. Araştırma, storyboard, sahne kurulumu ve taslak burada canlı ilerler.</p>;
  }
  if (!video) return null;
  return (
    <div className="flex flex-col gap-5">
      <VideoHeader video={video} run={run} />
      <DraftTabs key={`${latest.final.musicSha ?? ''}${latest.draft.videoSha ?? 'none'}`} pick={latest.draft} final={latest.final} />
      {run && <StepList run={run} />}
      <ResearchCard artifactId={latest.research} />
      <StoryboardCard artifactId={latest.storyboard} />
      <VoiceCard trackId={latest.voiceTrack} stemSha={latest.voiceStem} />
      <BuildCard reportId={latest.report} sceneId={latest.scene} sheetSha={latest.sheet} />
      <ReviewCard artifactId={latest.draft.reviewId} />
      <QcCard artifactId={latest.final.qcId} />
      <ReviewPanel reviews={reviews.data ?? []} runId={run?.id ?? null} status={video.status} sheetSha={sheet} canSeek={!!latest.final.musicSha} failed={reviews.isError} />
    </div>
  );
}
