import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.ts';
import { panelView, pickDraft, pickFinal, pickReviewSheet, pickVoice, pickStems, isRunActive } from '../../lib/production-view.ts';
import { latestRunOf, pipeline, seedRuns, seedVideos, useStore } from '../../lib/stores.ts';
import { BuildCard, ResearchCard, ReviewCard, StoryboardCard } from './ArtifactCards.tsx';
import { DraftTabs } from './DraftTabs.tsx';
import { QcCard } from './QcCard.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';
import { StepList } from './StepList.tsx';
import { AudioCard } from './AudioCard.tsx';
import { VideoHeader } from './VideoHeader.tsx';
import { VoiceCard } from './VoiceCard.tsx';

export function ProductionPanel({ videoId }: { videoId: string | null }) {
  const state = useStore(pipeline);
  const video = videoId ? state.videos[videoId]?.value : undefined;
  const run = videoId ? latestRunOf(state, videoId) : null;
  // Artifacts appear as steps finish: the detail (views + artifact list) is refetched whenever another step is done.
  const doneSteps = run?.steps.filter((s) => s.status === 'done').length ?? 0;
  const detail = useQuery({
    // The run's id is part of the key: two runs of one video (a produce and an audio edit) must not share the cache of "2 steps done".
    queryKey: ['video', videoId, run?.id ?? null, doneSteps],
    enabled: !!videoId,
    // A finished step refetches under a new key: keep showing this video's artifacts meanwhile (the cards no longer blink out), never another video's.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === videoId ? prev : undefined),
    queryFn: async () => { const r = await api.video(videoId!); seedVideos([r.data.video], r.eventId); seedRuns(r.data.runs, r.eventId); return r.data.artifacts; },
  });
  // The final review rounds follow the same trigger (a round lands when the review step is done) and the video's status.
  const reviews = useQuery({ queryKey: ['reviews', videoId, doneSteps, video?.status], enabled: !!videoId, queryFn: () => api.reviews(videoId!) });
  const versions = useQuery({ queryKey: ['versions', videoId, doneSteps, video?.status], enabled: !!videoId, queryFn: () => api.versions(videoId!) });
  // Plan M7 Y7: the picked review round (null = the newest); a new run starts again from its newest round.
  const [round, setRound] = useState<number | null>(null);
  useEffect(() => { setRound(null); }, [run?.id]);
  const panel = useMemo(() => panelView(reviews.data ?? [], run?.id, round) ?? panelView(reviews.data ?? [], run?.id), [reviews.data, run?.id, round]);
  const sheet = useMemo(() => (panel ? pickReviewSheet(detail.data ?? [], panel.runId, panel.round) : null), [panel, detail.data]);
  const latest = useMemo(() => {
    const list = detail.data ?? [];
    // An audio edit run (A6) has finals and stems only: the other cards fall back to the newest earlier artifact of the video.
    const find = (kind: string) => list.find((a) => a.kind === kind && (!run || a.runId === run.id)) ?? (run?.kind === 'audio_edit' ? list.find((a) => a.kind === kind) ?? null : null);
    const pick = (kind: string) => find(kind)?.id ?? null;
    return {
      research: pick('research'), storyboard: pick('storyboard'), report: pick('build_report'), scene: pick('scene'), sheet: find('preview_sheet')?.blobSha ?? null,
      ...pickVoice(list, run?.kind === 'audio_edit' ? null : run?.id ?? null), draft: pickDraft(list, run?.kind === 'audio_edit' ? null : run?.id ?? null), final: pickFinal(list, run?.id ?? null),
      stems: pickStems(list, run?.id ?? null, { fallback: run?.kind === 'audio_edit' }),
    };
  }, [detail.data, run]);

  if (!videoId) {
    return <p className="text-[13px] leading-relaxed text-ink-2">Type a product name and choose Create video. Research, storyboard, scene build and the draft show up here live.</p>;
  }
  if (!video) return null;
  return (
    <div className="flex flex-col gap-5">
      <VideoHeader video={video} run={run} />
      <DraftTabs key={`${latest.final.musicSha ?? ''}${latest.draft.videoSha ?? 'none'}`} pick={latest.draft} final={latest.final} versions={versions.data ?? []} />
      {/* Mounted on the video's status alone: the artifact query refetches under a new key as steps finish, and a final-based condition would remount the panel (and lose its state). */}
      {run && <StepList run={run} />}
      <ResearchCard artifactId={latest.research} video={video} />
      <StoryboardCard artifactId={latest.storyboard} />
      <AudioCard video={video} stems={latest.stems} canEdit={video.status === 'ready' && video.origin !== 'import' && !isRunActive(run)} />
      <VoiceCard trackId={latest.voiceTrack} stemSha={latest.voiceStem} />
      <BuildCard reportId={latest.report} sceneId={latest.scene} sheetSha={latest.sheet} />
      <ReviewCard artifactId={latest.draft.reviewId} />
      <QcCard artifactId={latest.final.qcId} />
      <ReviewPanel reviews={reviews.data ?? []} runId={run?.id ?? null} status={video.status} sheetSha={sheet} canSeek={!!latest.final.musicSha} failed={reviews.isError} round={round} onRound={setRound} />
    </div>
  );
}
