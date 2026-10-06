import { expect, test } from '@playwright/test';
import { holdRestart, killHard, releaseRestart, serverMaxEventId, SLOW_SCRIPT, startDevSession, waitForRestart } from './helpers.ts';

test.afterEach(() => { releaseRestart('worker'); });

test('S4: API restart → "yeniden bağlanıyor" → reconnect replays every missed event, ids without gaps', async ({ page, request }) => {
  test.setTimeout(90_000);
  // Record every ui event id the page receives, across EventSource instances (no hook in product code).
  await page.addInitScript(() => {
    const ids: number[] = [];
    (window as unknown as { __vgIds: number[] }).__vgIds = ids;
    const Native = window.EventSource;
    window.EventSource = class extends Native {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.addEventListener('ui', (e) => { try { ids.push(JSON.parse((e as MessageEvent).data).id); } catch { /* ignore */ } });
      }
    } as typeof EventSource;
  });
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByText('Worker canlı')).toBeVisible({ timeout: 10_000 });

  await startDevSession(request, { role: 'fixer', script: SLOW_SCRIPT });
  const card = page.getByTestId('agent-card').filter({ hasText: 'Düzeltici' }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  const old = killHard('api');
  await expect(page.getByText('Bağlantı koptu, yeniden bağlanıyor…')).toBeVisible({ timeout: 10_000 });
  await waitForRestart('api', old);
  await expect(page.getByText('Bağlantı koptu, yeniden bağlanıyor…')).toBeHidden({ timeout: 20_000 });
  await expect(card).toHaveAttribute('data-status', 'done', { timeout: 45_000 });

  const max = await serverMaxEventId(request);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __vgIds: number[] }).__vgIds.at(-1)), { timeout: 10_000 }).toBe(max);
  const ids = [...new Set(await page.evaluate(() => (window as unknown as { __vgIds: number[] }).__vgIds))].sort((a, b) => a - b);
  expect(ids.length).toBeGreaterThan(10);
  for (let i = 1; i < ids.length; i++) expect(ids[i], `gap after ${ids[i - 1]}`).toBe(ids[i - 1]! + 1);
});

test('S4: a dead worker shows "Worker yanıt vermiyor" and recovers when restarted', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByText('Worker canlı')).toBeVisible({ timeout: 10_000 });
  holdRestart('worker');
  const old = killHard('worker');
  await expect(footer.getByText('Worker yanıt vermiyor')).toBeVisible({ timeout: 15_000 });
  releaseRestart('worker');
  await waitForRestart('worker', old);
  await expect(footer.getByText('Worker canlı')).toBeVisible({ timeout: 20_000 });
});
