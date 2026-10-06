import { expect, test } from '@playwright/test';
import { produceVia } from './helpers.ts';

type Session = { id: string; role: string; runId: string | null; parentSessionId: string | null; status: string };
const sessionsOf = async (request: import('@playwright/test').APIRequestContext, runId: string) =>
  ((await (await request.get('/api/sessions?scope=recent&kind=pipeline')).json()) as Session[]).filter((s) => s.runId === runId);

test('S2b: storyboard → build: the builder card, the build card with its preview served by the media endpoint, the waiting note', async ({ page, request }) => {
  test.setTimeout(90_000);
  const { videoId, runId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(header).toHaveAttribute('data-status', 'needs_human');
  await expect(header).toContainText('Sahne kurulumu hazır. Taslak render bu sürümde henüz yok.');
  await expect(page.locator('[data-testid="step"][data-key="build"]')).toContainText('5 parça · 7.526 üçgen');
  const card = page.getByTestId('build-card');
  await expect(card).toContainText('5 parça · 7.526 üçgen · kahraman %80');
  const img = card.getByRole('img');
  await expect.poll(() => img.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(4 * 270 + 3 * 6);
  const src = (await img.getAttribute('src'))!;
  const ranged = await request.get(src, { headers: { range: 'bytes=0-7' } });
  expect(ranged.status()).toBe(206);
  expect([...(await ranged.body())]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
  expect((await sessionsOf(request, runId)).map((s) => s.role).sort()).toEqual(['builder', 'researcher', 'storyboarder']);
  await expect(page.getByTestId('agent-card').filter({ hasText: 'Video üretim' }).first()).toBeVisible();
});

test('S2b: a broken first build goes back to the same builder session and the step still finishes', async ({ page, request }) => {
  test.setTimeout(90_000);
  const { videoId, runId } = await produceVia(request, 'Bozuk sahne kalemi', 'silent');
  await page.goto(`/?video=${videoId}`);
  await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  const builders = (await sessionsOf(request, runId)).filter((s) => s.role === 'builder');
  expect(builders).toHaveLength(2);
  expect(builders.filter((s) => s.parentSessionId).length).toBe(1); // the fix request resumed the first session
  await expect(page.getByTestId('build-card')).toBeVisible();
});

test('S2b: "Üretimi durdur" during the build stops the builder; research and storyboard stay done', async ({ page, request }) => {
  test.setTimeout(90_000);
  const { videoId, runId } = await produceVia(request, 'Yavaş sahne kalemi', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
  await header.getByRole('button', { name: 'Üretimi durdur' }).click();
  await expect(header).toHaveAttribute('data-status', 'cancelled', { timeout: 15_000 });
  await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'cancelled');
  await expect(page.locator('[data-testid="step"][data-status="done"]')).toHaveCount(2);
  await expect.poll(async () => (await sessionsOf(request, runId)).find((s) => s.role === 'builder')?.status, { timeout: 15_000 }).toBe('cancelled');
  await expect(page.getByTestId('build-card')).toHaveCount(0);
});

test('S2b: the channel identity chosen in Settings is the style of the next build (K19)', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.goto('/settings');
  const group = page.getByRole('radiogroup', { name: 'Kanal kimliği' });
  await expect(page.getByText('Henüz seçilmedi')).toBeVisible(); // the note sits above the options
  await group.getByRole('radio', { name: /Beyaz laboratuvar/ }).click();
  await expect(group.getByRole('radio', { name: /Beyaz laboratuvar/ })).toHaveAttribute('aria-checked', 'true');
  const { videoId } = await produceVia(request, 'Beyaz kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('build-card')).toContainText('Beyaz laboratuvar', { timeout: 60_000 });
  await expect(page.locator('[data-testid="step"][data-key="build"]')).not.toContainText('kanal kimliği geçici');
});
