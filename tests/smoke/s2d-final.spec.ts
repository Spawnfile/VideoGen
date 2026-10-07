import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { produceVia, SMOKE_DIR } from './helpers.ts';

test('S2 (M5b): product → … → final → review panel → "yayına hazır"; the final plays from the library in both variants; the QC card and the review panel show gates and scores', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId, runId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(header).toHaveAttribute('data-status', 'ready', { timeout: 200_000 });
  await expect(header).toContainText('yayına hazır');
  await expect(page.locator('[data-testid="step"][data-key="final_render"]')).toContainText('1351 kare');
  await expect(page.locator('[data-testid="step"][data-key="compose"]')).toContainText('1080×1920 · 0:45');
  await expect(page.locator('[data-testid="step"][data-key="qc"]')).toContainText('G1 ✓ G5 ✓ G6 ✓');
  const qc = page.getByTestId('qc-card');
  await expect(qc).toContainText('Teslim ✓ · Güvenlik ✓ · Güvenli alan ✓');
  await expect(qc).toContainText('Ses');
  await expect(page.locator('[data-testid="step"][data-key="review"]')).toContainText(/Yayına hazır: .* puan/);
  await expect(page.locator('[data-testid="step"][data-key="finalize"]')).toHaveAttribute('data-status', 'done');
  const panel = page.getByTestId('review-panel');
  await expect(panel.getByTestId('reviewer-card')).toHaveCount(3);
  await expect(panel.getByTestId('panel-score')).toContainText('puan');

  await page.getByRole('link', { name: 'Kütüphane' }).click();
  const item = page.getByTestId('library-item').filter({ hasText: 'Tükenmez kalem' }).first();
  await expect(item).toHaveAttribute('data-status', 'ready');
  await expect(item.getByTestId('library-score')).toContainText('puan');
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

test('S2 (M5b): "rötuş" — the Studio shows the compose-scope fix round live, progress never goes back, the video ends ready and the final is rendered once', async ({ page, request }) => {
  test.setTimeout(360_000);
  const { videoId, runId } = await produceVia(request, 'Kalem rötuş', 'silent');
  // Recorded in the page before the review starts: the live "Düzeltme turu 1/3" line may be short-lived.
  await page.addInitScript(() => {
    (window as unknown as { __fixRoundSeen: boolean }).__fixRoundSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="final-round"]')?.textContent?.includes('Düzeltme turu 1/3')) (window as unknown as { __fixRoundSeen: boolean }).__fixRoundSeen = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto(`/?video=${videoId}`);
  await expect(page.locator('[data-testid="step"][data-key="compose"]')).toHaveAttribute('data-status', /running|done/, { timeout: 200_000 });
  const header = page.getByTestId('video-header');
  const bar = header.getByRole('progressbar', { name: 'Genel ilerleme' });
  const read = async () => { const v = await bar.getAttribute('aria-valuenow', { timeout: 1_000 }); return v === null ? null : Number(v); };
  const live: number[] = [];
  const sampler = setInterval(() => { void read().then((v) => { if (v !== null) live.push(v); }, () => {}); }, 150);
  try {
    await expect(header).toHaveAttribute('data-status', 'ready', { timeout: 300_000 });
  } finally {
    clearInterval(sampler);
  }
  const samples = [...live];
  const last = await read();
  if (last !== null) samples.push(last);
  expect(samples.length).toBeGreaterThan(5);
  for (let i = 1; i < samples.length; i++) expect(samples[i], `progress went back at sample ${i}`).toBeGreaterThanOrEqual(samples[i - 1]!);
  expect(await page.evaluate(() => (window as unknown as { __fixRoundSeen: boolean }).__fixRoundSeen), 'the header showed "Düzeltme turu 1/3" while running').toBe(true);

  // Durable proof of the fix round: compose/qc/review ran again in fix round 1; the frames were rendered once, in round 0.
  const r = await request.get(`/api/runs/${runId}`);
  expect(r.ok()).toBe(true);
  const steps = ((await r.json()) as { steps: { key: string; fixRound: number; note: string | null }[] }).steps;
  for (const key of ['compose', 'qc', 'review']) expect(steps.some((s) => s.key === key && s.fixRound === 1), `${key} in fix round 1`).toBe(true);
  const renders = steps.filter((s) => s.key === 'final_render');
  expect(renders).toHaveLength(1);
  expect(renders[0]!.fixRound).toBe(0);
  expect(renders[0]!.note).toContain('1351 kare');
  const vr = await request.get(`/api/videos/${videoId}`);
  expect(vr.ok()).toBe(true);
  expect(((await vr.json()) as { video: { status: string } }).video.status).toBe('ready');

  await expect(page.locator('[data-testid="step"][data-key="finalize"]')).toHaveAttribute('data-status', 'done');
  const panel = page.getByTestId('review-panel');
  await expect(panel.getByTestId('reviewer-card')).toHaveCount(3);
  const score = parseFloat(((await panel.getByTestId('panel-score').textContent()) ?? '').replace(',', '.'));
  expect(score).toBeGreaterThanOrEqual(80);
  await page.getByRole('link', { name: 'Kütüphane' }).click();
  await expect(page.getByTestId('library-item').filter({ hasText: 'Kalem rötuş' }).first().getByTestId('library-score')).toBeVisible();
});
