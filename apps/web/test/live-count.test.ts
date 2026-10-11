import { describe, expect, it } from 'vitest';
import type { VideoStatus } from '@videogen/shared/browser';
import { liveCount } from '../src/lib/poster.ts';

const v = (status: VideoStatus) => ({ status });

describe('liveCount', () => {
  it('counts running and queued only', () => {
    expect(liveCount([v('running'), v('queued'), v('ready'), v('needs_human'), v('failed'), v('cancelled'), v('running')])).toBe(3);
  });

  it('is zero for an empty list', () => {
    expect(liveCount([])).toBe(0);
  });
});
