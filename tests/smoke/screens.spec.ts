import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { startDevSession, STUCK_SCRIPT } from './helpers.ts';

test.skip(!process.env.VG_SCREENSHOTS, 'yalnızca elle: VG_SCREENSHOTS=1 npm run test:smoke -- screens');
test.use({ viewport: { width: 1440, height: 900 } });
/** Screens land in docs/m3 whatever the cwd (Playwright resolves a relative path against the cwd, not the spec). */
const shot = (name: string) => resolve(import.meta.dirname, '../../docs/m3', name);

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
