import http from 'node:http';
import { expect, test } from '@playwright/test';

test('S1: shell boots under 2 s and shows Claude connection, usage and worker liveness', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  const t0 = Date.now();
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000);

  const footer = page.getByRole('contentinfo');
  await expect(footer.getByText('Claude bağlı')).toBeVisible();
  await expect(footer.getByText('max', { exact: true })).toBeVisible();
  await expect(footer.getByTestId('usage-5h')).toContainText('%35');
  await expect(footer.getByTestId('usage-7d')).toContainText('%12');
  await expect(footer.getByText('Worker canlı')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await expect(page.getByRole('heading', { name: 'Claude bağlantısı' })).toBeVisible();
  await expect(page.getByText('claude.ai aboneliği')).toBeVisible();
  // M7 Y15: the safe area starts at the spec's default.
  await expect(page.getByTestId('safe-area-source')).toContainText('varsayılan');
  await expect(page.getByTestId('safe-area-top')).toHaveValue('150');
  await expect(page).toHaveTitle('VideoGen');
  expect(errors).toEqual([]);
});

test('S1: non-localhost Host is rejected on reads and on the event stream', async () => {
  for (const path of ['/api/health', '/events']) {
    const status = await new Promise<number>((ok, ko) => {
      const req = http.get({ host: '127.0.0.1', port: 5190, path, headers: { host: 'evil.example' } }, (r) => { ok(r.statusCode ?? 0); r.destroy(); });
      req.on('error', ko);
    });
    expect(status, path).toBe(403);
  }
});

test('S1: audit chain is valid after boot', async ({ request }) => {
  const r = await request.get('/api/audit/verify');
  const body = await r.json();
  expect(body.ok).toBe(true);
  expect(body.checked).toBeGreaterThanOrEqual(2);
});
