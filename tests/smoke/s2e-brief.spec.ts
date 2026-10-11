import { expect, test, type Page } from '@playwright/test';

/** Brief design Y1–Y5: the Studio form, the video header and the research card in the fake pipeline ("öneri …" makes the researcher recommend 40–50 s). */
const stopIfRunning = async (page: Page) => {
  const stop = page.getByTestId('video-header').getByRole('button', { name: 'Stop production' });
  if (await stop.isVisible()) await stop.click();
};

test('S2e: the form shows the defaults; Otomatik takes the agent\'s window, shown with its source next to the brief', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'New production' });
  await expect(bar.getByTestId('duration-badge')).toHaveText('Auto · the agent suggests, else the default 35–55 s');
  await expect(bar).toContainText('Defaults: length 35–55 s');
  // A duration in the brief fills Elle as "yönergeden"; removing it goes back to Otomatik.
  const brief = bar.getByRole('textbox', { name: /Brief/ });
  await brief.fill('20 sn olsun');
  await expect(bar.getByTestId('duration-badge')).toHaveText('18–22 s · from the brief');
  await brief.fill('Yaya odaklan, tempo hızlı.');
  await expect(bar.getByTestId('duration-badge')).toHaveText(/^Auto/);

  await bar.getByRole('textbox', { name: 'Product name' }).fill('Öneri kalemi');
  await bar.getByRole('button', { name: 'Create video' }).click();
  const header = page.getByTestId('video-header');
  await expect(header.getByTestId('video-duration')).toHaveText('35–55 s · default', { timeout: 15_000 });
  await expect(header.getByTestId('video-brief')).toContainText('Yaya odaklan, tempo hızlı.');
  await expect(page.getByTestId('agent-recommendation')).toContainText('Agent suggests 40–50 s · applied', { timeout: 30_000 });
  await expect(header.getByTestId('video-duration')).toHaveText('40–50 s · agent suggestion');
  await expect(page.getByTestId('agent-recommendation')).toContainText('Yayın geri itme anına odaklan.');
  await stopIfRunning(page);
});

test('S2e: the user\'s window beats the agent\'s recommendation', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'New production' });
  await bar.getByRole('radio', { name: 'Manual' }).click();
  await bar.getByRole('spinbutton', { name: 'min' }).fill('20');
  await bar.getByRole('spinbutton', { name: 'max' }).fill('25');
  await expect(bar.getByTestId('duration-badge')).toHaveText('20–25 s · your choice');
  await bar.getByRole('textbox', { name: 'Product name' }).fill('Öneri kalemi kısa');
  await bar.getByRole('button', { name: 'Create video' }).click();
  const header = page.getByTestId('video-header');
  await expect(header.getByTestId('video-duration')).toHaveText('20–25 s · your choice', { timeout: 15_000 });
  await expect(page.getByTestId('agent-recommendation')).toContainText('not applied, your choice of 20–25 s stands', { timeout: 30_000 });
  await expect(header.getByTestId('video-duration')).toHaveText('20–25 s · your choice');
  await stopIfRunning(page);
});
