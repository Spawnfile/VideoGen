import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { produceVia, SMOKE_DIR } from './helpers.ts';

test('S2 (M5a): product → … → final → automatic gates; the final plays from the library in both variants; the QC card shows gates and scores', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId, runId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 200_000 });
  await expect(header).toContainText('Final video hazır ve otomatik kontrolden geçti.');
  await expect(page.locator('[data-testid="step"][data-key="final_render"]')).toContainText('1351 kare');
  await expect(page.locator('[data-testid="step"][data-key="compose"]')).toContainText('1080×1920 · 0:45');
  await expect(page.locator('[data-testid="step"][data-key="qc"]')).toContainText('G1 ✓ G5 ✓ G6 ✓');
  const qc = page.getByTestId('qc-card');
  await expect(qc).toContainText('Teslim ✓ · Güvenlik ✓ · Güvenli alan ✓');
  await expect(qc).toContainText('Ses');

  await page.getByRole('link', { name: 'Kütüphane' }).click();
  const item = page.getByTestId('library-item').filter({ hasText: 'Tükenmez kalem' }).first();
  await expect(item.getByTestId('library-duration')).toHaveText(' · 0:45');
  await expect.poll(() => item.getByTestId('library-cover').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(540);
  await item.click();
  const video = page.getByTestId('final-video');
  await expect(page.getByRole('tab', { name: 'Final', exact: true })).toHaveAttribute('aria-selected', 'true');
  const music = (await video.getAttribute('src'))!;
  const ranged = await request.get(music, { headers: { range: 'bytes=0-11' } });
  expect([ranged.status(), ranged.headers()['content-type']]).toEqual([206, 'video/mp4']);
  await page.locator('body').focus();
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 10_000 }).toBeGreaterThan(0.3);
  await page.getByTestId('variant-chip').filter({ hasText: 'Müziksiz' }).click();
  await expect(video).not.toHaveAttribute('src', music);

  // Plan E6: the PNG frames of a finished run are gone; the composed files stay.
  const final = join(SMOKE_DIR, 'data', 'runs', runId, 'final');
  expect(readdirSync(final).filter((d) => d !== 'compose' && d !== 'qc').every((h) => !existsSync(join(final, h, 'frames')))).toBe(true);
});

test('S2 (M5a): the Studio shows the final steps\' live progress and the library prefers the final over the draft', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId } = await produceVia(request, 'Kalem final ilerleme', 'silent');
  await page.goto(`/?video=${videoId}`);
  await expect(page.locator('[data-testid="step"][data-key="compose"]')).toHaveAttribute('data-status', /running|done/, { timeout: 200_000 });
  const bar = page.getByTestId('video-header').getByRole('progressbar', { name: 'Genel ilerleme' });
  const before = Number(await bar.getAttribute('aria-valuenow'));
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'needs_human', { timeout: 200_000 });
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(before);
  const v = (await (await request.get(`/api/videos/${videoId}`)).json()) as { video: { final: { coverSha: string } | null; draft: { coverSha: string } | null } };
  expect(v.video.final!.coverSha).not.toBe(v.video.draft!.coverSha);
});
