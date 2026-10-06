import { expect, test } from '@playwright/test';
import { startDevSession, STUCK_SCRIPT } from './helpers.ts';

test('S3: a silent session reads "süreç canlı", then "takılmış olabilir"; Durdur cancels it', async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await startDevSession(request, { role: 'reviewer_retention', script: STUCK_SCRIPT });
  const card = page.getByTestId('agent-card').filter({ hasText: 'İzlenme reviewer' }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByText(/son olay \d+ sn önce · süreç canlı/)).toBeVisible({ timeout: 10_000 });
  const alert = card.getByRole('alert');
  await expect(alert).toContainText('Takılmış olabilir', { timeout: 15_000 });
  await alert.getByRole('button', { name: 'Durdur' }).click();
  await expect(card).toHaveAttribute('data-status', 'cancelled', { timeout: 15_000 });
  await expect(card.getByText('durduruldu', { exact: true })).toBeVisible();
  await expect(card.getByRole('alert')).toHaveCount(0);
  const id = await card.getAttribute('data-session');
  expect((await (await request.get(`/api/sessions/${id}`)).json()).status).toBe('cancelled');
});
