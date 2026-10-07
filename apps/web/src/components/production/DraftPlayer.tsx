import { Player, type PlayerRef } from '@remotion/player';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared/browser';
import { Draft3D, draftProps } from '@videogen/remotion';
import { api, blobUrl } from '../../lib/api.ts';
import { setActivePlayer } from '../../lib/player.ts';
import type { DraftPick } from '../../lib/production-view.ts';

function useContent<T>(id: string | null) {
  return useQuery({ queryKey: ['artifact', id], enabled: !!id, staleTime: Number.POSITIVE_INFINITY, queryFn: async () => (await api.artifact(id!)).content as T });
}

/**
 * Spec §13.1 "Taslak": the Draft3D composition the renderer uses, live in @remotion/player from the run's GLB, camera track,
 * scene spec and storyboard. A lazy chunk (probe P7: 1.45 MB), mounted only while its tab is open (grilling C26).
 */
export default function DraftPlayer({ pick }: { pick: DraftPick }) {
  const scene = useContent<SceneSpec>(pick.sceneId);
  const board = useContent<Storyboard>(pick.storyboardId);
  const track = useContent<{ yfov: number[] }>(pick.trackId);
  const ref = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const props = useMemo(() => (scene.data && board.data && track.data && pick.glbSha
    ? draftProps({ glbUrl: blobUrl(pick.glbSha), yfov: track.data.yfov, width: 540, height: 960, scene: scene.data, storyboard: board.data, style: CHANNEL_STYLES[scene.data.style_id] })
    : null), [scene.data, board.data, track.data, pick.glbSha]);
  useEffect(() => {
    const p = ref.current;
    if (!p || !props) return;
    const on = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('frameupdate', on);
    setActivePlayer({ kind: 'draft', toggle: () => p.toggle(), pause: () => p.pause(), seekBy: (s) => p.seekTo(Math.max(0, Math.min(props.frames, p.getCurrentFrame() + Math.round(s * 30)))), seekTo: (s) => p.seekTo(Math.max(0, Math.min(props.frames, Math.round(s * 30)))) });
    return () => { p.removeEventListener('frameupdate', on); setActivePlayer(null); };
  }, [props]);
  if (!props) return <p className="py-10 text-center text-[13px] text-ink-3">Taslak yükleniyor…</p>;
  return (
    <div data-testid="draft-live" data-frame={frame}>
      <Player
        ref={ref}
        component={Draft3D}
        inputProps={props}
        durationInFrames={props.frames + 1}
        fps={30}
        compositionWidth={props.width}
        compositionHeight={props.height}
        controls
        clickToPlay
        style={{ width: '100%', aspectRatio: '9 / 16', borderRadius: 12, overflow: 'hidden' }}
      />
    </div>
  );
}
