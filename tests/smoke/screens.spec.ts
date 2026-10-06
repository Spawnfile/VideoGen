import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { startDevSession, STUCK_SCRIPT } from './helpers.ts';

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
