export interface Clock { now(): number; sleep(ms: number): Promise<void> }

export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))) };

/** Tests: `sleep` advances the time at once (a 60 s back-off costs nothing). */
export function fakeClock(start = Date.parse('2026-10-08T12:00:00Z')): Clock & { advance(ms: number): void } {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms) => { t += Math.max(0, ms); await Promise.resolve(); },
    advance: (ms) => { t += ms; },
  };
}
