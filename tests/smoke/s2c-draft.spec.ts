import { expect, test, type APIRequestContext } from '@playwright/test';
import { produceVia } from './helpers.ts';

type Session = { id: string; role: string; runId: string | null; parentSessionId: string | null; status: string };
const sessionsOf = async (request: APIRequestContext, runId: string) =>
  ((await (await request.get('/api/sessions?scope=recent&kind=pipeline')).json()) as Session[]).filter((s) => s.runId === runId);

test('S2: product → draft → review; the draft MP4 streams with Range and plays; the library shows cover and length and opens it in the player', async ({ page, request }) => {
  test.setTimeout(150_000);
  const { videoId, runId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 90_000 });
  await expect(header).toContainText('Taslak hazır ve incelendi. Final render bu sürümde henüz yok.');
  await expect(page.locator('[data-testid="step"][data-key="draft_render"]')).toContainText('540×960 · 0:02');
  await expect(page.locator('[data-testid="step"][data-key="draft_review"]')).toContainText('geçti · küçük bulgu: Yazılar okunur');
  await expect(page.getByTestId('review-card')).toContainText('Yazılar okunur');
  const src = (await page.getByTestId('draft-video').getAttribute('src'))!;
  const ranged = await request.get(src, { headers: { range: 'bytes=0-11' } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()['content-type']).toBe('video/mp4');
  expect(Buffer.from(await ranged.body()).subarray(4, 8).toString()).toBe('ftyp');
  expect((await sessionsOf(request, runId)).map((s) => s.role).sort()).toEqual(['builder', 'researcher', 'reviewer_visual', 'storyboarder']);

  // Spec §16.2 S2 (M4: the draft instead of the final): from the library to a playing video.
  await page.getByRole('link', { name: 'Kütüphane' }).click();
  const item = page.getByTestId('library-item').filter({ hasText: 'Tükenmez kalem' }).first();
  await expect(item.getByTestId('library-duration')).toHaveText(' · 0:02');
  await expect.poll(() => item.getByTestId('library-cover').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(270);
  await item.click();
  const video = page.getByTestId('draft-video');
  await expect(video).toBeVisible();
  await page.locator('body').focus();
  await page.keyboard.press('Space'); // spec §13.4
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 10_000 }).toBeGreaterThan(0.3);
  await page.keyboard.press('k');
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(true);

  // The live tab: the same composition in @remotion/player (lazy chunk, WebGL canvas); Space plays it too.
  await page.getByRole('tab', { name: 'Taslak', exact: true }).click();
  const live = page.getByTestId('draft-live');
  await expect(live.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.locator('body').focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => Number(await live.getAttribute('data-frame')), { timeout: 10_000 }).toBeGreaterThan(5);
});

test('S2: a flawed draft goes back to build once ("Taslak turu 1/2"), the same builder session fixes it, the second review passes, progress never goes back', async ({ page, request }) => {
  test.setTimeout(150_000);
  const { videoId, runId } = await produceVia(request, 'Kusurlu kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  const bar = header.getByRole('progressbar', { name: 'Genel ilerleme' });
  const samples: number[] = [];
  const sampler = setInterval(() => { void bar.getAttribute('aria-valuenow', { timeout: 100 }).then((v) => { if (v !== null) samples.push(Number(v)); }, () => {}); }, 150);
  try {
    await expect(page.getByTestId('draft-round')).toContainText('Taslak turu 1/2', { timeout: 90_000 });
    await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 90_000 });
  } finally {
    clearInterval(sampler);
  }
  for (let i = 1; i < samples.length; i++) expect(samples[i], `progress went back at sample ${i}`).toBeGreaterThanOrEqual(samples[i - 1]!);
  await expect(page.getByTestId('draft-round')).toHaveCount(0);
  await expect(page.getByTestId('review-card')).toContainText('geçti');
  const s = await sessionsOf(request, runId);
  expect(s.filter((x) => x.role === 'reviewer_visual')).toHaveLength(2);
  const builders = s.filter((x) => x.role === 'builder');
  expect(builders).toHaveLength(2);
  expect(builders.filter((b) => b.parentSessionId)).toHaveLength(1); // the fix round resumed the first builder session
  const run = (await (await request.get(`/api/runs/${runId}`)).json()) as { steps: { key: string; round: number; attempt: number }[] };
  expect(run.steps.map((x) => [x.key, x.round, x.attempt])).toEqual([['research', 0, 1], ['storyboard', 0, 1], ['build', 1, 1], ['draft_render', 1, 1], ['draft_review', 1, 1]]);
});
