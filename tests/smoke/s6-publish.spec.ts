import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import pg from 'pg';
import { SMOKE_DIR } from './helpers.ts';

const APP_SMOKE = 'postgres://videogen_app:videogen_app@127.0.0.1:5433/videogen_smoke';
const URL_OK = 'https://www.tiktok.com/@whats.inside59/video/7423456789012345678';

async function readyVideo(request: APIRequestContext, productName: string): Promise<string> {
  const r = await request.post('/api/dev/videos/ready', { data: { productName } });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { videoId: string }).videoId;
}
async function mockStats(): Promise<{ inits: number; puts: number }> {
  const { base } = JSON.parse(readFileSync(join(SMOKE_DIR, 'tiktok.json'), 'utf8')) as { base: string };
  return (await (await fetch(`${base}/__mock/stats`)).json()) as { inits: number; puts: number };
}
async function sql<T = Record<string, unknown>>(q: string, args: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: APP_SMOKE });
  await c.connect();
  try { return (await c.query(q, args)).rows as T[]; } finally { await c.end(); }
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('S6: a ready video goes to the TikTok inbox from the finish window, is marked published, and the audit records both', async ({ page, request }) => {
  test.setTimeout(90_000);
  const videoId = await readyVideo(request, 'Smoke kalem yayın');
  const before = await mockStats();
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(header).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });
  await page.getByTestId('publish-open').click();
  const panel = page.getByRole('region', { name: 'Yayın' });
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('publish-variant-tiktok')).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByTestId('publish-caption')).toHaveValue(/Smoke kalem yayın içinde ne var\?/);
  await panel.getByTestId('publish-send').click();
  await expect(panel.getByTestId('publish-stage')).toHaveAttribute('data-stage', 'sent', { timeout: 30_000 });
  await expect(panel.getByTestId('publish-stage')).toHaveText('Gelen kutusunda');
  const card = panel.getByTestId('finish-card');
  await expect(card).toBeVisible();
  await card.getByTestId('caption-copy').click();
  await expect(card.getByTestId('caption-copy')).toHaveText('Kopyalandı');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('#içindeneVar');
  await expect(card.getByTestId('mark-published')).toBeDisabled();
  for (const id of ['sound', 'visibility', 'commercial']) await card.getByTestId(`check-${id}`).check();
  await card.getByTestId('published-url').fill(URL_OK);
  await card.getByTestId('mark-published').click();
  await expect(panel.getByTestId('publish-stage')).toHaveAttribute('data-stage', 'published', { timeout: 10_000 });
  await expect(header).toHaveAttribute('data-status', 'published', { timeout: 10_000 });
  const after = await mockStats();
  expect(after.inits - before.inits).toBe(1);
  expect(after.puts - before.puts).toBe(1);
  const actions = (await sql<{ action: string }>(
    "SELECT a.action FROM audit_log a JOIN publications p ON p.id::text = a.subject_id WHERE p.video_id = $1 AND a.action LIKE 'publish.%' ORDER BY a.id", [videoId],
  )).map((r) => r.action);
  expect(actions).toEqual(['publish.queued', 'publish.uploading', 'publish.processing', 'publish.sent', 'publish.marked']);
});

test('S6: the sixth draft in 24 h is blocked before TikTok sees it', async ({ page, request }) => {
  test.setTimeout(60_000);
  const videoId = await readyVideo(request, 'Smoke kalem limit');
  // Five counted drafts of another video fill the 24 h window (this video has none of its own, so the panel shows the send form).
  const other = await readyVideo(request, 'Smoke kalem dolu');
  const [{ version_id: versionId }] = await sql<{ version_id: string }>('SELECT best_version_id AS version_id FROM videos WHERE id = $1', [other]);
  await sql("UPDATE publications SET created_at = now() - interval '2 days'"); // the first scenario's send ages out
  for (let i = 0; i < 5; i += 1) {
    await sql(
      `INSERT INTO publications (id, video_id, version_id, variant, status, blob_sha, bytes, publish_id, caption, aigc_required, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'music', 'sent', 'x', 1, $3, 'c', false, now() - ($4 || ' hours')::interval)`,
      [other, versionId, `seed${i}`, String(i + 1)],
    );
  }
  const before = await mockStats();
  await page.goto(`/?video=${videoId}`);
  await page.getByTestId('publish-open').click();
  const panel = page.getByRole('region', { name: 'Yayın' });
  await expect(panel).toContainText(/5\/5 taslak \(24 saat\) · sonraki \d{2}:\d{2}/);
  await expect(panel.getByTestId('publish-blockers')).toContainText('Son 24 saatte 5 taslak gönderildi');
  await expect(panel.getByTestId('publish-send')).toBeDisabled();
  const r = await request.post(`/api/videos/${videoId}/publish`, { data: { variant: 'tiktok' } });
  expect(r.status()).toBe(409);
  expect(((await r.json()) as { error: string }).error).toMatch(/^Son 24 saatte 5 taslak gönderildi/);
  expect((await mockStats()).inits).toBe(before.inits);
});
