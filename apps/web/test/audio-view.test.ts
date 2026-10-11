import { describe, expect, it } from 'vitest';
import type { ArtifactMeta } from '@videogen/shared/browser';
import { pickStems, stemFileName } from '../src/lib/production-view.ts';

const a = (id: string, kind: string, runId = 'r1', blobSha: string | null = `sha-${id}`): ArtifactMeta => ({ id, runId, stepId: null, versionId: null, kind, blobSha, createdAt: '2026-10-11T00:00:00Z' });

describe('audio card helpers (agent music design A5)', () => {
  it('the run\'s newest stems and score; another run\'s stems are not mixed in', () => {
    const list = [a('m2', 'stem_music'), a('s2', 'stem_sfx'), a('m1', 'stem_music'), a('v1', 'stem_voice'), a('sc', 'music', 'r1', null), a('x', 'stem_music', 'r0')];
    expect(pickStems(list, 'r1')).toEqual({ music: 'sha-m2', voice: 'sha-v1', sfx: 'sha-s2', scoreId: 'sc' });
    expect(pickStems(list, 'r2')).toEqual({ music: null, voice: null, sfx: null, scoreId: null });
    // an audio edit that has not recorded its stems yet shows the video's newest ones
    expect(pickStems(list, 'r2', { fallback: true })).toEqual({ music: 'sha-m2', voice: 'sha-v1', sfx: 'sha-s2', scoreId: 'sc' });
  });

  it('download names are plain ASCII the media endpoint accepts', () => {
    expect(stemFileName('Tükenmez Kalem', 'music')).toBe('tukenmez-kalem-music.flac');
    expect(stemFileName('Şarj aleti (USB-C)', 'effects')).toBe('sarj-aleti-usb-c-effects.flac');
    expect(stemFileName('!!!', 'voice')).toBe('video-voice.flac');
  });
});
