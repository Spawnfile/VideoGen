import { describe, expect, it } from 'vitest';
import { planSfxYaklasim } from '../src/pipeline/sound.ts';

describe('YAKLASIM SFX plan (spec Y15)', () => {
  it('nothing in the first 5 s; part locks snap ≥ 0.25 s apart, flash cuts tap, the last lock lands; no whoosh, tick or label sounds', () => {
    const ev = (id: string, type: 'explode_start' | 'part_lock' | 'label_in' | 'zoom', frame: number) => ({ id, type, frame });
    const events = [ev('e0', 'explode_start', 0), ev('l0', 'label_in', 0), ev('p1', 'part_lock', 90), ev('p2', 'part_lock', 180), ev('p3', 'part_lock', 186), ev('p4', 'part_lock', 210), ev('z', 'zoom', 240), ev('p5', 'part_lock', 375)];
    const beats = [{ id: 'b0', t_start: 0, transition: 'cut' }, { id: 'b3', t_start: 5.5, transition: 'flash' }, { id: 'b5', t_start: 10.5, transition: 'flash' }, { id: 'bx', t_start: 4, transition: 'flash' }];
    const cues = planSfxYaklasim({ events, beats, fps: 30, durationS: 13 });
    expect(cues.every((c) => c.atMs >= 5000)).toBe(true);
    expect(new Set(cues.map((c) => c.name))).toEqual(new Set(['y_snap', 'y_tap', 'y_land']));
    expect(cues.find((c) => c.source === 'event:p5')).toMatchObject({ name: 'y_land', atMs: 12500 });
    expect(cues.find((c) => c.source === 'event:p2')).toMatchObject({ name: 'y_snap', atMs: 6000 });
    expect(cues.find((c) => c.source === 'event:p3')).toBeUndefined(); // 0.2 s after p2
    expect(cues.find((c) => c.source === 'beat:b3')).toMatchObject({ name: 'y_tap', atMs: 5500 });
    expect(cues.find((c) => c.source === 'event:p1')).toBeUndefined(); // 3 s: inside the quiet first 5 s
    const sorted = [...cues].sort((a, b) => a.atMs - b.atMs);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.atMs - sorted[i - 1]!.atMs).toBeGreaterThanOrEqual(250);
  });
});
