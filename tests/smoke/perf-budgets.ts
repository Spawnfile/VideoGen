/**
 * Plan M7 Y13 (spec §12.4, §16.2 S8): the performance budgets smoke S8 asserts. Fixed here so a change is a reviewed diff,
 * never a tweak inside the spec.
 */

/** B1 scroll: CPU slowed down 4× over CDP (`Emulation.setCPUThrottlingRate`). */
export const CPU_THROTTLE = 4;
/** Frames per measurement (`requestAnimationFrame` intervals) and the programmatic scroll per frame. */
export const SCROLL_FRAMES = 240;
export const SCROLL_STEP_PX = 40;
/** Each scene is measured this many times; the median p95 is asserted (cloud VM frame timing wobbles). */
export const MEASUREMENTS = 3;
/** p95 frame interval: one 60 Hz frame (16.67 ms) plus 0.8 %; ~12 dropped frames in 240 break it. */
export const FRAME_P95_MS = 16.8;
/** Windowed trace (Y13): DOM trace rows after scrolling a 1000-row trace. */
export const MAX_MOUNTED_TRACE_ROWS = 400;

/** B2 idle: no throttling, Studio open, event stream live (heartbeat and usage polling). */
export const IDLE_WINDOW_MS = 10_000;
/** Main-thread `TaskDuration` growth over the window (`Performance.getMetrics`), seconds: 2 %. */
export const IDLE_TASK_S = 0.2;
/** No `longtask` entry may be longer than this. */
export const LONG_TASK_MS = 50;

// B3 boot: S1's "shell boots under 2 s" stays as it is (asserted in s1-boot.spec.ts).
