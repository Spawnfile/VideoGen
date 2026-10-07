import { expect, test } from '@playwright/test';
import { produceVia } from './helpers.ts';

test('S2a: product name → research → … → final and automatic checks, one run for a double click, monotone progress, listed in the library', async ({ page, request }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'Yeni üretim' });
  await bar.getByRole('textbox', { name: 'Ürün adı' }).fill('Tükenmez kalem');
  await bar.getByRole('radio', { name: 'Seslendirmesiz' }).click();
  const listed = async () => { const r = await request.get('/api/videos'); expect(r.ok()).toBe(true); return (await r.json()) as { id: string; status: string; statusNote: string | null }[]; };
  const beforeIds = new Set((await listed()).map((v) => v.id));
  const before = beforeIds.size;
  // Two clicks in one task: only the send lock can stop the second (separate clicks would see the cleared box).
  await bar.getByRole('button', { name: 'Üret' }).evaluate((b) => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });

  const header = page.getByTestId('video-header');
  const bar2 = header.getByRole('progressbar', { name: 'Genel ilerleme' });
  const samples: number[] = [];
  const sampler = setInterval(() => { void bar2.getAttribute('aria-valuenow', { timeout: 100 }).then((v) => { if (v !== null) samples.push(Number(v)); }, () => {}); }, 150);
  try {
    await expect(page.locator('[data-testid="step"][data-key="research"]')).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
    await expect(page.getByTestId('research-card')).toContainText('Basmalı, tek kullanımlık', { timeout: 30_000 });
    await expect(page.locator('[data-testid="step"][data-key="storyboard"]')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await expect(header).toHaveAttribute('data-status', 'ready', { timeout: 200_000 });
  } finally {
    clearInterval(sampler);
  }
  const last = await bar2.getAttribute('aria-valuenow');
  const seen = [...samples, ...(last !== null ? [Number(last)] : [])];
  await expect(header).toContainText('yayına hazır');
  await expect(page.getByTestId('storyboard-card').locator('li')).toHaveCount(7);
  await expect(bar2).toHaveAttribute('aria-valuenow', '100');
  expect(seen.length).toBeGreaterThan(5);
  for (let i = 1; i < seen.length; i++) expect(seen[i], `progress went back at sample ${i}`).toBeGreaterThanOrEqual(seen[i - 1]!);
  const all = await listed();
  const created = all.filter((v) => !beforeIds.has(v.id));
  expect(created).toHaveLength(1);
  expect([created[0]!.status, created[0]!.statusNote]).toEqual(['ready', null]);
  expect(all.length - before).toBe(1);

  await page.getByRole('link', { name: 'Kütüphane' }).click();
  await expect(page.getByTestId('library-item').filter({ hasText: 'Tükenmez kalem' }).first()).toHaveAttribute('data-status', 'ready');
});

test('S2a: a product that cannot be modelled stops at research with the reason', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { videoId } = await produceVia(request, 'İmkansız telefon işlemcisi', 'silent');
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'needs_human', { timeout: 30_000 });
  await expect(page.getByTestId('research-card')).toContainText('modellenemiyor');
  await expect(page.locator('[data-testid="step"][data-key="storyboard"]')).toHaveAttribute('data-status', 'skipped');
});

test('S2a: Durdur cancels a running production and progress does not go back', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { videoId, runId } = await produceVia(request, 'Zımba', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(page.locator('[data-testid="step"][data-key="research"]')).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
  const at = Number(await header.getByRole('progressbar', { name: 'Genel ilerleme' }).getAttribute('aria-valuenow'));
  await header.getByRole('button', { name: 'Üretimi durdur' }).click();
  await expect(header).toHaveAttribute('data-status', 'cancelled', { timeout: 15_000 });
  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(10);
  expect(Number(await header.getByRole('progressbar', { name: 'Genel ilerleme' }).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(at);
  // The research agent itself is stopped (not left to finish and settle the step afterwards).
  const sessionId = ((await (await request.get(`/api/runs/${runId}`)).json()) as { steps: { sessionId: string | null }[] }).steps[0]!.sessionId;
  expect(sessionId).toBeTruthy();
  await expect.poll(async () => ((await (await request.get(`/api/sessions/${sessionId}`)).json()) as { status: string }).status, { timeout: 15_000 })
    .toMatch(/^(cancelled|done|failed)$/);
  expect(((await (await request.get(`/api/sessions/${sessionId}`)).json()) as { status: string }).status).toBe('cancelled');
  await page.waitForTimeout(500);
  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(10);
});
