import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../../lib/api.ts';
import { latestRunOf, pipeline, seedRuns, seedVideos, useStore } from '../../lib/stores.ts';
import { BuildCard, ResearchCard, StoryboardCard } from './ArtifactCards.tsx';
import { StepList } from './StepList.tsx';
import { VideoHeader } from './VideoHeader.tsx';

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
  const latest = useMemo(() => {
    const list = detail.data ?? [];
    const find = (kind: string) => list.find((a) => a.kind === kind && (!run || a.runId === run.id)) ?? null;
    const pick = (kind: string) => find(kind)?.id ?? null;
    return { research: pick('research'), storyboard: pick('storyboard'), report: pick('build_report'), scene: pick('scene'), sheet: find('preview_sheet')?.blobSha ?? null };
  }, [detail.data, run]);

  if (!videoId) {
    return <p className="text-[13px] leading-relaxed text-ink-2">Üstteki alana bir ürün adı yazıp Üret'e basın. Araştırma, storyboard ve sahne kurulumu burada canlı ilerler.</p>;
  }
  if (!video) return null;
  return (
    <div className="flex flex-col gap-5">
      <VideoHeader video={video} run={run} />
      {run && <StepList run={run} />}
      <ResearchCard artifactId={latest.research} />
      <StoryboardCard artifactId={latest.storyboard} />
      <BuildCard reportId={latest.report} sceneId={latest.scene} sheetSha={latest.sheet} />
    </div>
  );
}
