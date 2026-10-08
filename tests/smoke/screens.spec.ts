import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { produceVia, startDevSession, STUCK_SCRIPT } from './helpers.ts';

test.skip(!process.env.VG_SCREENSHOTS, 'yalnızca elle: VG_SCREENSHOTS=1 npm run test:smoke -- screens');
test.use({ viewport: { width: 1440, height: 900 } });
/** Screens land in docs/<dir> whatever the cwd (Playwright resolves a relative path against the cwd, not the spec). */
const shot = (name: string, dir = 'm3') => resolve(import.meta.dirname, '../../docs', dir, name);

test('M3 screen: agent cards', async ({ page, request }) => {
  test.setTimeout(60_000);
  await startDevSession(request, { role: 'researcher', script: { fixture: 'websearch' } });
  await startDevSession(request, { role: 'builder', script: { fixture: 'coding', stall: { afterIndex: 194, ms: 600_000, cpuPct: 31 } } });
  await startDevSession(request, { role: 'reviewer_visual', script: STUCK_SCRIPT });
  await page.goto('/');
  await expect(page.getByTestId('agent-card')).toHaveCount(3);
  await expect(page.getByRole('alert')).toContainText('Takılmış olabilir', { timeout: 20_000 });
  const done = page.getByTestId('agent-card').filter({ hasText: 'Araştırmacı' });
  await expect(done).toHaveAttribute('data-status', 'done', { timeout: 20_000 });
  await done.getByRole('button', { name: 'İzi göster' }).click();
  await expect(page.getByTestId('agent-card').filter({ hasText: 'notes.txt' })).toBeVisible();
  await page.waitForTimeout(600); // let the trace's fade-in settle
  await page.screenshot({ path: shot('agents.png') });
});

test('M3 screen: chat with live trace', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const chat = page.getByRole('region', { name: 'Chat' });
  await chat.getByRole('button', { name: 'Yeni sohbet' }).click();
  const box = chat.getByRole('textbox', { name: 'Mesaj' });
  await box.fill('Tükenmez kalemin içinde hangi parçalar var?');
  await box.press('Enter');
  await expect(chat.locator('[data-testid="thinking"][data-variant="search"]')).toHaveAttribute('data-status', 'settled', { timeout: 30_000 });
  await box.fill('Notları bir dosyaya yaz.');
  await box.press('Enter');
  const coding = chat.locator('[data-testid="thinking"][data-variant="coding"]').last();
  await expect(coding).toHaveAttribute('data-status', 'live', { timeout: 30_000 });
  await page.screenshot({ path: shot('chat-live.png') });
  await expect(coding).toHaveAttribute('data-status', 'settled', { timeout: 30_000 });
  await expect(chat.locator('[data-testid="chat-message"][data-role="assistant"]')).toHaveCount(2, { timeout: 30_000 });
  await coding.getByRole('button', { name: /araç çalıştırdı/ }).click();
  await expect(coding.getByText('notes.txt').first()).toBeVisible();
  await page.waitForTimeout(600); // let the expand transition settle
  await page.screenshot({ path: shot('chat.png') });
});

test('M3 screen: settings roles', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Agent rolleri' })).toBeVisible();
  await page.screenshot({ path: shot('settings-roles.png'), fullPage: true });
});
test('M4 screen: studio production', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'Yeni üretim' });
  await bar.getByRole('textbox', { name: 'Ürün adı' }).fill('Tükenmez kalem');
  await bar.getByRole('radio', { name: 'Seslendirmesiz' }).click();
  await bar.getByRole('button', { name: 'Üret' }).click();
  const header = page.getByTestId('video-header');
  await expect(page.locator('[data-testid="step"][data-key="research"]')).toHaveAttribute('data-status', 'running', { timeout: 15_000 });
  await page.screenshot({ path: shot('studio-running.png', 'm4') });
  await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 30_000 });
  await expect(page.getByTestId('storyboard-card')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('studio-done.png', 'm4'), fullPage: true });
});

test('M4 screen: library', async ({ page, request }) => {
  await request.post('/api/videos', { data: { productName: 'Zımba', audioMode: 'silent' } });
  await page.goto('/library');
  await expect(page.getByTestId('library-item').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('library.png', 'm4') });
  await page.getByTestId('library-item').first().click();
  await expect(page.getByTestId('video-header')).toBeVisible();
});

test('M4b screen: studio build card', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'Yeni üretim' });
  await bar.getByRole('textbox', { name: 'Ürün adı' }).fill('Tükenmez kalem');
  await bar.getByRole('radio', { name: 'Seslendirmesiz' }).click();
  await bar.getByRole('button', { name: 'Üret' }).click();
  const card = page.getByTestId('build-card');
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => card.getByRole('img').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await card.scrollIntoViewIfNeeded(); // the production panel scrolls on its own; a full-page shot would miss the card
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('studio-build.png', 'm4') });
});

test('M4b screen: channel identity (K19)', async ({ page }) => {
  await page.goto('/settings');
  const group = page.getByRole('radiogroup', { name: 'Kanal kimliği' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect.poll(() => group.getByRole('img').first().evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('settings-k19.png', 'm4'), fullPage: true });
});

test('M4c screen: studio draft round, review card and the two player tabs', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { videoId } = await produceVia(request, 'Kusurlu kalem', 'silent', 'draft_review');
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('draft-round')).toContainText('Taslak turu 1/2', { timeout: 60_000 });
  await page.screenshot({ path: shot('studio-draft-round.png', 'm4') });
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'needs_human', { timeout: 60_000 });
  await expect(page.getByTestId('review-card')).toContainText('geçti');
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('studio-draft.png', 'm4') });
  await page.getByRole('tab', { name: 'Taslak', exact: true }).click();
  await expect(page.getByTestId('draft-live').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: shot('studio-draft-live.png', 'm4') });
});

test('M4c screen: library with draft covers and lengths', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByTestId('library-cover').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('library-draft.png', 'm4') });
});

test('M5a screen: studio final tab and the QC card', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId } = await produceVia(request, 'Tükenmez kalem', 'silent', 'qc');
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('qc-card')).toBeVisible({ timeout: 200_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('studio-final.png', 'm5'), fullPage: true });
  await page.getByTestId('draft-tabs').screenshot({ path: shot('studio-player.png', 'm5') });
  // The production panel scrolls on its own (fullPage cannot reach below the player): the variant chips and the QC card.
  await page.getByTestId('qc-card').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('studio-qc.png', 'm5') });
});

test('M5a screen: library with final covers', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByTestId('library-cover').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('library-final.png', 'm5') });
});

// Serial: the library test below needs the ready video the studio test produces.
test.describe.configure({ mode: 'serial' });

test('M5b screen: studio review panel (three reviewers, gates, bars, score)', async ({ page, request }) => {
  test.setTimeout(300_000);
  const { videoId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'ready', { timeout: 240_000 });
  const panel = page.getByTestId('review-panel');
  await expect(panel.getByTestId('reviewer-card')).toHaveCount(3);
  await expect(panel.getByTestId('panel-score')).toContainText('puan');
  await panel.scrollIntoViewIfNeeded(); // the production panel scrolls on its own
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('studio-review.png', 'm5') });
});

test('M5b screen: library with the panel score', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByTestId('library-score').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('library-score.png', 'm5') });
});

test('M5c screen: studio voice card with the audio player and the final', async ({ page, request }) => {
  test.setTimeout(300_000);
  // Tall enough for the player and the voice card in one image (the production panel scrolls on its own).
  await page.setViewportSize({ width: 1440, height: 3000 });
  const { videoId } = await produceVia(request, 'Tükenmez kalem', 'vo');
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'ready', { timeout: 240_000 });
  const card = page.getByTestId('voice-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('voice-audio')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Final', exact: true })).toHaveAttribute('aria-selected', 'true');
  const video = page.getByTestId('final-video');
  await expect(video).toBeVisible();
  // Park the final inside a narrated beat (the fake render draws no captions; real ones are checked in T12).
  await video.evaluate(async (v) => {
    const el = v as HTMLVideoElement;
    if (el.readyState < 1) await new Promise((r) => el.addEventListener('loadedmetadata', r, { once: true }));
    const seeked = new Promise((r) => el.addEventListener('seeked', r, { once: true })); // before the seek, or the event can be missed
    el.currentTime = 12;
    await seeked;
  });
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.getByTestId('voice-audio').evaluate((a) => (a as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('studio-voice.png', 'm5') });
});

test('M6 screen: publish panel with the finish card, and the TikTok connection in Settings', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 2200 });
  const r = await request.post('/api/dev/videos/ready', { data: { productName: 'Tükenmez kalem' } });
  const { videoId } = (await r.json()) as { videoId: string };
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });
  await page.getByTestId('publish-open').click();
  const panel = page.getByRole('region', { name: 'Yayın' });
  await panel.getByTestId('publish-send').click();
  await expect(panel.getByTestId('finish-card')).toBeVisible({ timeout: 30_000 });
  await panel.getByTestId('check-visibility').check();
  await panel.getByText('Kaynaklar (4)').click();
  await page.waitForTimeout(300);
  await panel.screenshot({ path: shot('publish-panel.png', 'm6') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  await expect(page.getByTestId('tiktok-connection')).toContainText('Bağlı: @whats.inside59');
  await page.getByTestId('tiktok-test').click();
  await expect(page.getByTestId('tiktok-connection')).toContainText('Bağlantı çalışıyor');
  await page.getByTestId('tiktok-connection').screenshot({ path: shot('settings-tiktok.png', 'm6') });
});

test('M7 screens: audit explorer, library compare, asset ledger, Settings data', async ({ page, request }) => {
  test.setTimeout(120_000);
  // A researcher session gives the audit tool rows; a seeded ready video gets a second finished version (fix round 1) to compare.
  await startDevSession(request, { role: 'researcher', script: { fixture: 'websearch' } });
  const r = await request.post('/api/dev/videos/ready', { data: { productName: 'Tükenmez kalem' } });
  const { videoId } = (await r.json()) as { videoId: string };
  const db = new pg.Client({ connectionString: 'postgres://videogen_app:videogen_app@127.0.0.1:5433/videogen_smoke' });
  await db.connect();
  try {
    const dims = (d: number) => JSON.stringify({ D1: 12 + d, D2: 13, D3: 10, D4: 14, D5: 8 + d, D6: 10, D7: 4, D8: 6 + d, D9: 7 });
    const [v1] = (await db.query("SELECT id FROM versions WHERE video_id = $1 AND round = 0", [videoId])).rows as { id: string }[];
    const [v2] = (await db.query(
      "INSERT INTO versions (id, video_id, parent_version_id, round, reason, created_at) VALUES (gen_random_uuid(), $1, $2, 1, 'fix:compose', now() + interval '2 minutes') RETURNING id",
      [videoId, v1!.id],
    )).rows as { id: string }[];
    await db.query(
      `INSERT INTO artifacts (id, version_id, run_id, step_id, kind, blob_sha, content, input_hash, duration_ms, width, height, codec, meta, created_at)
       SELECT gen_random_uuid(), $2, run_id, step_id, kind, blob_sha, content, input_hash, duration_ms, width, height, codec, meta, now() + interval '2 minutes'
         FROM artifacts WHERE version_id = $1 AND kind IN ('final_video_music', 'final_video_tiktok', 'final_cover')`,
      [v1!.id, v2!.id],
    );
    await db.query("UPDATE reviews SET dimension_scores = $2 WHERE version_id = $1 AND reviewer_role = 'orchestrator'", [v1!.id, dims(0)]);
    await db.query(
      `INSERT INTO reviews (id, video_id, version_id, run_id, step_id, round, reviewer_role, seq, rubric_version, total, dimension_scores, gates, verdict, created_at)
       SELECT gen_random_uuid(), video_id, $2, run_id, step_id, 1, reviewer_role, seq, rubric_version, 91.5, $3, gates, verdict, now() + interval '2 minutes'
         FROM reviews WHERE version_id = $1 AND reviewer_role = 'orchestrator'`,
      [v1!.id, v2!.id, dims(2)],
    );
    await db.query('UPDATE videos SET best_version_id = $2, current_version_id = $2 WHERE id = $1', [videoId, v2!.id]);
  } finally {
    await db.end();
  }

  await page.goto('/audit');
  await expect(page.getByTestId('chain-status')).toHaveAttribute('data-tone', 'ok', { timeout: 15_000 });
  await expect(page.getByText('Worker canlı')).toBeVisible({ timeout: 15_000 });
  const tool = page.getByTestId('audit-row').filter({ hasText: 'agent.tool' }).first();
  await expect(tool).toBeVisible({ timeout: 20_000 });
  await tool.click();
  await expect(page.getByTestId('audit-detail').getByText(/^Araç girdisi/)).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('audit.png', 'm7') });

  // Tall enough for both players and the score deltas under them (the page scrolls inside its own panel, fullPage cannot reach).
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto(`/library/${videoId}`);
  await expect(page.getByTestId('versions-list').getByTestId('version-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Karşılaştır' }).click();
  const compare = page.getByTestId('compare-view');
  await expect(compare.locator('video')).toHaveCount(2);
  for (const v of await compare.locator('video').all()) await expect.poll(() => v.evaluate((e) => (e as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await expect(compare.getByTestId('compare-delta')).toBeVisible();
  await expect(page.getByText('Worker canlı')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('library-compare.png', 'm7') });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/assets');
  await expect(page.getByTestId('asset-row').first()).toBeVisible();
  await expect(page.getByText('Worker canlı')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('assets.png', 'm7') });

  await page.goto('/settings');
  const data = page.getByTestId('data-status');
  await expect(data.getByTestId('backup-status')).toBeVisible();
  await data.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await data.screenshot({ path: shot('settings-data.png', 'm7') });
});
