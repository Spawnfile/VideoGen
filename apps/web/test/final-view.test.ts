import { describe, expect, it } from 'vitest';
import { buildQcReport, evaluateQc, type ArtifactMeta, type QcMeasure } from '@videogen/shared/browser';
import { pickFinal, playerTabs, qcLines } from '../src/lib/production-view.ts';

const a = (kind: string, runId: string, i: number): ArtifactMeta => ({ id: `${kind}-${runId}-${i}`, runId, stepId: null, versionId: null, kind, blobSha: `${kind}-sha-${i}`, createdAt: '' });

describe('final player and QC card helpers', () => {
  it('picks the run\'s newest final variants, cover and QC report', () => {
    const list = [a('final_video_music', 'r1', 2), a('final_video_tiktok', 'r1', 2), a('final_cover', 'r1', 2), a('qc_report', 'r1', 1), a('final_video_music', 'r0', 1)];
    expect(pickFinal(list, 'r1')).toEqual({ musicSha: 'final_video_music-sha-2', tiktokSha: 'final_video_tiktok-sha-2', coverSha: 'final_cover-sha-2', qcId: 'qc_report-r1-1' });
    expect(pickFinal([], 'r1').musicSha).toBeNull();
  });

  it('opens on "Final" when a final exists, otherwise on the draft MP4; no tabs without media', () => {
    expect(playerTabs({ final: true, draft: true })).toEqual({ tabs: [['final', 'Final'], ['mp4', 'Taslak MP4'], ['live', 'Taslak']], initial: 'final' });
    expect(playerTabs({ final: false, draft: true })).toEqual({ tabs: [['mp4', 'Taslak MP4'], ['live', 'Taslak']], initial: 'mp4' });
    expect(playerTabs({ final: false, draft: false }).tabs).toEqual([]);
  });

  it('words a QC report for the card: gates, scores and every failed check with its value and limit', () => {
    const m: QcMeasure = {
      video: { codec: 'h264', profile: 'High', width: 1080, height: 1920, fps: '30/1', pixFmt: 'yuv420p', colorRange: 'tv', colorSpace: 'bt709', colorPrimaries: 'bt709', colorTransfer: 'bt709', frames: 1351, durationS: 45.03, bitrateKbps: 1200, maxGopFrames: 60, faststart: true },
      audio: { codec: 'aac', sampleRate: 48000 }, bytes: 8e6, loudness: { i: -14.1, tp: -1.5, lra: 5 }, firstAudioS: 0, silences: [{ start: 12, end: 13.3 }], blacks: [], freezes: [], flashMaxPerS: 0, flashAt: null, loopSsim: 0.95, edgeBands: { maxDensity: 0, at: null },
    };
    const rep = buildQcReport(evaluateQc(m, { variant: 'music', layoutIssues: [], coverOk: true }), evaluateQc(m, { variant: 'tiktok' }));
    expect(qcLines(rep)).toEqual({
      gates: 'Teslim ✓ · Güvenlik ✓ · Güvenli alan ✓',
      scores: 'Ses 9/12 · Teknik cila 4/5',
      failures: ['Sessizlik: 1,3 sn (≤ 0,3 sn) · 0:12', 'Bit hızı: 1,2 Mbps (3–11 Mbps)'],
    });
  });
});
