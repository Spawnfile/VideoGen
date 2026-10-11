import { expect, test } from '@playwright/test';
import { produceVia } from './helpers.ts';

/** Agent music design A1–A7 in the fake stack: the composer's music, the audio reviewer, the stems card and an audio edit. */
test('S2f: the composer\'s music, the audio reviewer in the panel, the stems card (play and download) and an audio edit that becomes a new version', async ({ page, request }) => {
  test.setTimeout(300_000);
  const { videoId } = await produceVia(request, 'Müzikli kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(page.locator('[data-testid="step"][data-key="music"]')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expect(page.locator('[data-testid="step"][data-key="music"]')).toContainText('3 bölüm · 100 BPM · A minör');
  await expect(header).toHaveAttribute('data-status', 'ready', { timeout: 200_000 });

  const card = page.getByTestId('audio-card');
  await expect(card.getByTestId('music-score')).toContainText('Music by the composer agent: A minor · 100 BPM · 3 sections');
  await expect(card.getByTestId('stem-music')).toBeVisible();
  await expect(card.getByTestId('stem-sfx')).toBeVisible();
  // A stem downloads as FLAC with a plain name.
  const href = await card.getByTestId('stem-music').getByRole('link', { name: 'Download FLAC' }).getAttribute('href');
  expect(href).toMatch(/\?download=muzikli-kalem-music\.flac$/);
  const dl = await request.get(href!);
  expect(dl.status()).toBe(200);
  expect(dl.headers()['content-disposition']).toBe('attachment; filename="muzikli-kalem-music.flac"');
  // The audio reviewer sat on the panel.
  const reviews = (await (await request.get(`/api/videos/${videoId}/reviews`)).json()) as { reviewerRole: string }[];
  expect(reviews.map((r) => r.reviewerRole)).toContain('reviewer_audio');

  // An audio edit by instruction: a new run (music → remix), the picture kept, a new best version.
  const before = (await (await request.get(`/api/videos/${videoId}/versions`)).json()) as unknown[];
  await card.getByRole('textbox', { name: 'Edit the audio with the agents' }).fill('Müzik daha sakin olsun, davul olmasın.');
  await card.getByRole('button', { name: 'Send to the agents' }).click();
  await expect(card.getByRole('status')).toContainText('Audio edit started');
  await expect(page.locator('[data-testid="step"][data-key="remix"]')).toHaveAttribute('data-status', 'done', { timeout: 90_000 });
  await expect(page.locator('[data-testid="step"][data-key="remix"]')).toContainText('ses yeniden karıştırıldı');
  await expect(header).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
  const after = (await (await request.get(`/api/videos/${videoId}/versions`)).json()) as { reason: string; best: boolean }[];
  expect(after.length).toBe(before.length + 1);
  expect(after.find((v) => v.reason === 'audio_edit')).toMatchObject({ best: true });
  // The other cards are still there after the edit (they fall back to the produce run).
  await expect(page.getByTestId('research-card')).toBeVisible();
  await expect(page.getByTestId('audio-card').getByTestId('stem-music')).toBeVisible();
});
