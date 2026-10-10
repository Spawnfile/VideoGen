import { mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Storyboard } from '@videogen/shared';
import { audioFacts, rmsCurve } from '../src/pipeline/audio-facts.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const sb = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts/storyboard-kalem.json'), 'utf8')) as Storyboard;

describe('audio facts for reviewer_audio (agent music design A11)', () => {
  it('measures a dBFS curve per half second from a real file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vg-afacts-'));
    const f = join(dir, 'x.wav');
    // 1 s of silence, then 1 s of a -20 dBFS-ish sine
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'aevalsrc=if(lt(t\\,1)\\,0\\,0.1*sin(2*PI*440*t)):s=48000:d=2', f]);
    const c = await rmsCurve(FFMPEG, f);
    expect(c).toHaveLength(4);
    expect(c[0]).toBe(-90);
    expect(c[3]!).toBeGreaterThan(-25);
    expect(c[3]!).toBeLessThan(-20);
  });

  it('music under the voice, the voice above it, and the lift at the hook, rehook and payoff', () => {
    const n = Math.ceil(sb.duration_s / 0.5);
    const music = Array.from({ length: n }, (_, i) => (i * 0.5 >= sb.payoff_at ? -14 : -24));
    const voice = Array.from({ length: n }, (_, i) => (i % 4 < 2 ? -12 : -90));
    const f = audioFacts({ music, voice, sfx: null, storyboard: sb });
    expect(f.musicUnderVoiceDb).not.toBeNull();
    expect(f.voiceOverMusicDb!).toBeGreaterThan(5);
    const payoff = f.moments.find((m) => m.name === 'ödül')!;
    expect(payoff.liftDb).toBe(10);
    expect(f.moments.find((m) => m.name === 'kanca')!.beforeDb).toBeNull();
    expect(audioFacts({ music: null, voice, sfx: null, storyboard: sb })).toMatchObject({ moments: [], musicUnderVoiceDb: null, musicRangeDb: null });
  });
});
