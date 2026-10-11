import { describe, expect, it } from 'vitest';
import { keyboardInset, layoutFor } from '../src/lib/viewport.ts';

describe('viewport helpers', () => {
  it('picks the layout by width: phone under 768, tablet under 1200, desktop above', () => {
    expect([320, 390, 767, 768, 1024, 1199, 1200, 1440].map(layoutFor)).toEqual(['phone', 'phone', 'phone', 'tablet', 'tablet', 'tablet', 'desktop', 'desktop']);
  });

  it('measures how much of the layout viewport the on-screen keyboard covers', () => {
    expect(keyboardInset(844, null)).toBe(0);
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
    expect(keyboardInset(844, { height: 508, offsetTop: 40 })).toBe(296);
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0);
  });
});
