import { expect, test, type Page } from '@playwright/test';

/** S9: VideoGen as a phone app — tab bar, the New video sheet, chat, library detail, settings → audit, no sideways scroll, installable. */

async function noSideScroll(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${where} scrolls sideways`).toBeLessThanOrEqual(0);
}

test('S9: the phone layout covers produce, chat, library and settings without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('navigation', { name: 'Main menu' });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('link')).toHaveText(['Studio', 'Chat', 'Library', 'Settings']);
  await expect(page.getByRole('contentinfo')).toBeHidden(); // the desktop footer moves into the status sheet
  await expect(page.getByText('Worker live')).toBeHidden();
  await noSideScroll(page, 'Studio');

  // Chat on its own tab (before producing: the worker runs a chat turn after a running production).
  await tabs.getByRole('link', { name: 'Chat' }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Tükenmez kalemin içinde ne var?');
  await page.getByRole('button', { name: 'Send' }).click();
  // The message is in and its turn has started (S5 covers the streamed answer; here the worker may still be busy with earlier tests' runs).
  await expect(page.locator('[data-testid="chat-message"][data-role="user"]').first()).toContainText('Tükenmez kalemin içinde ne var?');
  await expect(page.locator('[data-testid="chat-message"][data-role="assistant"]').first().or(page.getByRole('button', { name: 'Stop' }))).toBeVisible({ timeout: 15_000 });
  await noSideScroll(page, 'Chat');

  await tabs.getByRole('link', { name: 'Studio' }).click();

  // New video: the docked box opens the sheet; an empty Studio shows the form inline instead.
  const dock = page.getByTestId('produce-dock');
  if (await dock.isVisible()) await dock.click();
  const form = page.getByRole('region', { name: 'New production' });
  await form.getByRole('textbox', { name: 'Product name' }).fill('Mobil kalem');
  await form.getByRole('button', { name: 'Create video' }).click();
  await expect(page.getByTestId('video-header')).toContainText('Mobil kalem', { timeout: 15_000 });
  await expect(page.getByRole('tab', { name: /Mobil kalem/ })).toHaveAttribute('aria-selected', 'true');

  // Status pill → usage sheet.
  await page.getByTestId('status-pill').click();
  const sheet = page.getByRole('dialog', { name: 'Usage and status' });
  await expect(sheet.getByTestId('sheet-usage-5h')).toContainText(/\d+%/);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  // Library → detail (back arrow in the top bar) → back.
  await tabs.getByRole('link', { name: 'Library' }).click();
  await page.getByTestId('library-item').filter({ hasText: 'Mobil kalem' }).first().click();
  await expect(page.getByTestId('library-detail')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Versions' })).toHaveAttribute('aria-selected', 'true');
  await noSideScroll(page, 'Library detail');
  // The embedded audit log must not take over the page's top bar.
  await page.getByRole('tab', { name: 'Audit log' }).click();
  await page.getByRole('tab', { name: 'Versions' }).click();
  await expect(page.getByRole('button', { name: 'Open in Studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Library' }).click();
  await expect(page).toHaveURL(/\/library$/);

  // Settings → grouped rows → Audit log → a row's detail.
  await tabs.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('settings-list')).toBeVisible();
  await page.getByRole('button', { name: 'Agent roles' }).click();
  await expect(page.getByRole('heading', { name: 'Agent roles', level: 1 })).toBeVisible();
  await noSideScroll(page, 'Agent roles');
  await page.getByRole('button', { name: 'Back to Settings' }).click();
  await page.getByRole('button', { name: 'Audit log' }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(tabs.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  // The top-bar back returns to the settings list, and the system back from there does not loop into the audit log again.
  await page.getByRole('button', { name: 'Back to Settings' }).click();
  await expect(page.getByTestId('settings-list')).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/audit$/);
  await page.goForward();
  await expect(page.getByTestId('settings-list')).toBeVisible();
  await page.getByRole('button', { name: 'Audit log' }).click();
  await page.getByTestId('audit-row').first().click();
  await expect(page.getByTestId('audit-detail')).toBeVisible();
  await noSideScroll(page, 'Audit log');
  await page.getByTestId('audit-filter-open').click();
  await expect(page.getByRole('dialog', { name: 'Filter the audit log' })).toBeVisible();
});

test('S9: with the keyboard open the New video sheet stays inside the visible area', async ({ page, request }) => {
  await request.post('/api/dev/videos/ready', { data: { productName: 'Klavye kalem' } }); // the dock shows once a video exists
  await page.goto('/');
  await page.getByTestId('produce-dock').click();
  // What lib/viewport.ts sets when a 340 px keyboard opens (headless Chrome has no soft keyboard).
  await page.evaluate(() => { document.documentElement.style.setProperty('--kb-inset', '340px'); document.documentElement.dataset.kb = 'open'; });
  const panel = page.locator('dialog.sheet .sheet-panel');
  // Measured once the slide-up animation is over.
  await expect.poll(async () => { const b = (await panel.boundingBox())!; return Math.round(b.y + b.height); }, { message: 'the sheet runs under the keyboard' }).toBeLessThanOrEqual(844 - 340);
  expect((await panel.boundingBox())!.y, 'the sheet top is above the screen').toBeGreaterThanOrEqual(0);
  await expect(page.getByRole('dialog', { name: 'New video' }).getByRole('button', { name: 'Close' })).toBeInViewport();
});

test('S9: installable — manifest, icons and an active service worker that leaves the API alone', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json() as { display: string; start_url: string; icons: { src: string; purpose: string }[] };
  expect(m).toMatchObject({ display: 'standalone', start_url: '/' });
  expect(m.icons.map((i) => i.purpose)).toEqual(['any', 'any', 'maskable']);
  for (const i of m.icons) expect((await request.get(i.src)).status(), i.src).toBe(200);
  expect((await request.get('/icons/apple-touch-icon-180.png')).status()).toBe(200);

  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none'), { timeout: 15_000 }).toBe('activated');
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // The worker caches the shell only; a live API answer still comes from the server.
  expect(await page.evaluate(async () => (await fetch('/api/health', { cache: 'no-store' })).ok)).toBe(true);
  expect(await page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('vg-shell-')))).toBe(true);
});
