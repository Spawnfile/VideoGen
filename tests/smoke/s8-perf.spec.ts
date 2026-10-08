import { expect, test, type APIRequestContext, type CDPSession, type Locator, type Page } from '@playwright/test';
import {
  CPU_THROTTLE, FRAME_P95_MS, IDLE_TASK_S, IDLE_WINDOW_MS, LONG_TASK_MS, MAX_MOUNTED_TRACE_ROWS, MEASUREMENTS, SCROLL_FRAMES, SCROLL_STEP_PX,
} from './perf-budgets.ts';
import { startDevSession } from './helpers.ts';

/** Plan M7 Y13: frame budgets under 4× CPU throttling, the windowed trace and the idle Studio (spec §12.4, §16.2 S8). */
test.use({ viewport: { width: 1440, height: 900 } });

type Session = { id: string; role: string; status: string };
interface FrameStats { p50: number; p95: number; p99: number; max: number; over: number; frames: number }

const sessions = async (request: APIRequestContext) => ((await (await request.get('/api/sessions?kind=pipeline')).json()) as Session[]);

/** Starts a Fake-driver session and waits until it is done; returns its id (the one session that was not there before). */
async function doneSession(request: APIRequestContext, role: string, fixture: string): Promise<string> {
  const before = new Set((await sessions(request)).map((s) => s.id));
  await startDevSession(request, { role, script: { fixture } });
  let id = '';
  await expect.poll(async () => {
    const s = (await sessions(request)).find((x) => !before.has(x.id) && x.role === role);
    id = s?.id ?? '';
    return s?.status;
  }, { timeout: 60_000 }).toBe('done');
  return id;
}

/** Intervals are rounded to 0.1 ms, the resolution of `performance.now()` here (16.700000000000728 is 16.7); nearest-rank percentiles. */
function stats(d: number[]): FrameStats {
  const s = d.map((x) => Math.round(x * 10) / 10).sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.at(-1)!, over: s.filter((x) => x > FRAME_P95_MS).length, frames: s.length };
}

/** Scrolls the element by a fixed step every frame (back and forth at the ends) and returns the rAF intervals. */
async function scrollFrames(el: Locator, from: number): Promise<number[]> {
  return el.evaluate((node, o) => new Promise<number[]>((done) => {
    const box = node as HTMLElement;
    box.scrollTop = o.from;
    const d: number[] = [];
    let dir = 1;
    let last = 0;
    const frame = (t: number) => {
      d.push(t - last);
      last = t;
      const max = box.scrollHeight - box.clientHeight;
      if ((dir > 0 && box.scrollTop + o.step > max) || (dir < 0 && box.scrollTop - o.step < 0)) dir = -dir;
      box.scrollTop += dir * o.step;
      if (d.length < o.frames) requestAnimationFrame(frame);
      else done(d);
    };
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  }), { from, step: SCROLL_STEP_PX, frames: SCROLL_FRAMES });
}

/** Three throttled measurements; logs the raw distribution of each (ledger) and returns the median p95. */
async function measure(page: Page, cdp: CDPSession, name: string, el: Locator, from: number): Promise<number> {
  const p95s: number[] = [];
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  try {
    for (let i = 0; i < MEASUREMENTS; i++) {
      const s = stats(await scrollFrames(el, from));
      console.log(`S8 ${name} #${i + 1}: ${JSON.stringify(s)}`);
      p95s.push(s.p95);
      await page.waitForTimeout(300);
    }
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const median = [...p95s].sort((a, b) => a - b)[Math.floor(p95s.length / 2)]!;
  console.log(`S8 ${name}: median p95 ${median} ms (budget ${FRAME_P95_MS} ms)`);
  return median;
}

/** Trace rows mounted under `scope`: the rows each mounted block holds (`data-rows`; a closed block mounts only its header) plus prose rows. */
const mountedRows = (scope: Locator) => scope.evaluate((el) => [...el.querySelectorAll('[data-testid="thinking"]')]
  .filter((t) => !t.parentElement?.closest('[data-testid="thinking"]'))
  .reduce((n, t) => n + Number(t.getAttribute('data-rows')), 0) + el.querySelectorAll('[data-testid="trace-text"]').length);

test('S8: 4× CPU: step list and a 1000-row trace scroll at p95 ≤ 16.8 ms with at most 400 trace rows mounted', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId } = (await (await request.post('/api/dev/videos/ready', { data: { productName: 'Smoke kalem ölçüm' } })).json()) as { videoId: string };
  const small = [
    await doneSession(request, 'researcher', 'websearch'),
    await doneSession(request, 'builder', 'coding'),
    await doneSession(request, 'reviewer_visual', 'subagent'),
  ];
  const cdp = await page.context().newCDPSession(page);
  const panel = page.getByRole('region', { name: 'Üretim', exact: true });

  // (a) A finished 10-step run and three open agent cards with their recorded traces.
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });
  await expect(page.getByTestId('step')).toHaveCount(10);
  for (const id of small) {
    const card = page.locator(`[data-testid="agent-card"][data-session="${id}"]`);
    await card.getByRole('button', { name: 'İzi göster' }).click();
    await expect(card.getByTestId('thinking').first()).toBeAttached();
  }
  const a = await measure(page, cdp, 'steps + agent cards', panel, 0);

  // (b) A 1000-row session trace (generated fixture), the whole trace open in its card.
  const long = await doneSession(request, 'storyboarder', 'long-trace');
  expect(((await (await request.get(`/api/sessions/${long}/trace`)).json()) as unknown[]).length).toBe(1000);
  await page.goto(`/?video=${videoId}`);
  const card = page.locator(`[data-testid="agent-card"][data-session="${long}"]`);
  await card.getByRole('button', { name: 'İzi göster' }).click();
  await expect(card.getByTestId('thinking').first()).toBeAttached();
  const from = await card.evaluate((c) => {
    let box = c.parentElement;
    while (box && getComputedStyle(box).overflowY !== 'auto') box = box.parentElement;
    return box ? c.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop : 0;
  });
  const b = await measure(page, cdp, '1000-row trace', panel, from);
  const mounted = await mountedRows(card);
  console.log(`S8 1000-row trace: ${mounted} trace rows mounted after scrolling (budget ${MAX_MOUNTED_TRACE_ROWS})`);

  // The whole trace is reachable by scrolling: its last row (the answer) renders at the bottom.
  await panel.evaluate((p) => { p.scrollTop = p.scrollHeight; });
  await expect(card.getByTestId('trace-text').filter({ hasText: /^Bitti: \d+ adımda/ })).toBeVisible();

  expect(mounted).toBeLessThanOrEqual(MAX_MOUNTED_TRACE_ROWS);
  expect(a).toBeLessThanOrEqual(FRAME_P95_MS);
  expect(b).toBeLessThanOrEqual(FRAME_P95_MS);
});

test('S8: idle Studio stays under 0.2 s of main-thread work in 10 s with no long task', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { videoId } = (await (await request.post('/api/dev/videos/ready', { data: { productName: 'Smoke kalem boşta' } })).json()) as { videoId: string };
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });
  await expect(page.getByText('Worker canlı')).toBeVisible({ timeout: 15_000 }); // the event stream is open (heartbeat)
  await page.waitForTimeout(1_000); // let the first fetches and the fade-ins settle

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const task = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')?.value ?? Number.NaN);
  await page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__longTasks.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
  });
  const t0 = await task();
  await page.waitForTimeout(IDLE_WINDOW_MS);
  const busy = (await task()) - t0;
  const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
  console.log(`S8 idle: TaskDuration +${busy.toFixed(4)} s in ${IDLE_WINDOW_MS / 1000} s (budget ${IDLE_TASK_S} s), long tasks ${JSON.stringify(longTasks)}`);
  expect(busy).toBeLessThanOrEqual(IDLE_TASK_S);
  expect(longTasks.filter((ms) => ms > LONG_TASK_MS)).toEqual([]);
});
