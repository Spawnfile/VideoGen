import { describe, expect, it } from 'vitest';
import type { ArtifactMeta, RunView, StepView } from '@videogen/shared/browser';
import { shortcutFor } from '../src/lib/player.ts';
import { draftRoundLabel, pickDraft } from '../src/lib/production-view.ts';

const key = (k: string, o: { tag?: string; ctrl?: boolean; editable?: boolean } = {}) =>
  shortcutFor({ key: k, ctrlKey: !!o.ctrl, metaKey: false, altKey: false, target: { tagName: o.tag ?? 'BODY', isContentEditable: !!o.editable } });

describe('player shortcuts and draft view helpers', () => {
  it('maps Space, J, K, L and N (either case) and stays out of the way while typing, with modifiers and on focused buttons', () => {
    expect([' ', 'j', 'K', 'l', 'N'].map((k) => key(k))).toEqual(['toggle', 'back', 'pause', 'forward', 'new']);
    expect(key('n', { tag: 'INPUT' })).toBeNull();
    expect(key('j', { tag: 'TEXTAREA' })).toBeNull();
    expect(key('k', { editable: true })).toBeNull();
    expect(key('l', { ctrl: true })).toBeNull();
    expect(key(' ', { tag: 'BUTTON' })).toBeNull();
    expect(key('j', { tag: 'BUTTON' })).toBe('back');
    expect(key('x')).toBeNull();
  });

  it('picks the run\'s latest draft artifacts and labels a draft fix round with its own progress', () => {
    const a = (kind: string, runId: string, i: number): ArtifactMeta => ({ id: `${kind}-${runId}-${i}`, runId, stepId: null, versionId: null, kind, blobSha: `${kind}-sha-${i}`, createdAt: '' });
    const list = [a('draft_video', 'r2', 2), a('draft_video', 'r2', 1), a('draft_cover', 'r2', 1), a('scene_glb', 'r2', 1), a('camera_track', 'r2', 1), a('scene', 'r2', 1), a('storyboard', 'r2', 1), a('draft_review', 'r2', 1), a('draft_video', 'r1', 1)];
    expect(pickDraft(list, 'r2')).toEqual({
      videoSha: 'draft_video-sha-2', coverSha: 'draft_cover-sha-1', glbSha: 'scene_glb-sha-1', trackId: 'camera_track-r2-1', sceneId: 'scene-r2-1', storyboardId: 'storyboard-r2-1', reviewId: 'draft_review-r2-1',
    });
    expect(pickDraft([], 'r2').videoSha).toBeNull();
    const step = (key: StepView['key'], weight: number, status: StepView['status'], progress: number, round: number): StepView =>
      ({ id: key, runId: 'r', key, ordinal: 0, weight, status, progress, progressSource: null, attempt: 1, round, sessionId: null, error: null, note: null, startedAt: null, endedAt: null });
    const run = (steps: StepView[], status: RunView['status'] = 'running'): RunView => ({ id: 'r', videoId: 'v', kind: 'produce', status, progress: 60, etaS: 100, error: null, createdAt: '', startedAt: null, endedAt: null, steps });
    const loop = [step('build', 42.86, 'running', 50, 1), step('draft_render', 9.52, 'pending', 0, 1), step('draft_review', 11.9, 'pending', 0, 1)];
    expect(draftRoundLabel(run(loop))).toBe('Taslak turu 1/2 · %33');
    expect(draftRoundLabel(run(loop, 'done'))).toBe('');
    expect(draftRoundLabel(run(loop.map((s) => ({ ...s, round: 0 }))))).toBe('');
  });
});
