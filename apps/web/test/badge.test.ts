import { describe, expect, it } from 'vitest';
import { badgeCount } from '../src/lib/badge.ts';

describe('app icon badge', () => {
  it('counts the videos that wait for the user: needs you, or failed', () => {
    const v = (status: string) => ({ status }) as never;
    expect(badgeCount([v('running'), v('ready'), v('cancelled')])).toBe(0);
    expect(badgeCount([v('needs_human'), v('failed'), v('ready'), v('needs_human')])).toBe(3);
  });
});
