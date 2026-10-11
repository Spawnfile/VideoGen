import { expect, test, type Page } from '@playwright/test';

/** YAKLASIM spec Y1/Y7: the Studio form states the fixed approach; the brief reaches the video; the agent's length suggestion never moves the window. */
const stopIfRunning = async (page: Page) => {
  const stop = page.getByTestId('video-header').getByRole('button', { name: 'Stop production' });
  if (await stop.isVisible()) await stop.click();
};

test('S2e: the form states YAKLASIM (no length or voice controls); the brief reaches the video; the window stays 12–15 s whatever the agent suggests', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'New production' });
  await expect(bar.getByTestId('yaklasim-line')).toHaveText('YAKLASIM · 12–15 s · no voiceover · English on-screen text');
  await expect(bar).toContainText('it cannot change the approach');
  await expect(bar.getByRole('radiogroup', { name: 'Length' })).toHaveCount(0);
  await expect(bar.getByRole('radiogroup', { name: 'Voiceover' })).toHaveCount(0);
  await bar.getByRole('textbox', { name: /Brief/ }).fill('Yaya odaklan, tempo hızlı.');
  await bar.getByRole('textbox', { name: 'Product name' }).fill('Öneri kalemi');
  await bar.getByRole('button', { name: 'Create video' }).click();
  const header = page.getByTestId('video-header');
  await expect(header.getByTestId('video-duration')).toHaveText('12–15 s · default', { timeout: 15_000 });
  await expect(header.getByTestId('video-brief')).toContainText('Yaya odaklan, tempo hızlı.');
  // "öneri …" makes the fake researcher suggest 40–50 s: kept as information, never applied.
  await expect(page.getByTestId('agent-recommendation')).toContainText('Agent suggests 40–50 s · YAKLASIM length is fixed at 12–15 s', { timeout: 30_000 });
  await expect(header.getByTestId('video-duration')).toHaveText('12–15 s · default');
  await expect(page.getByTestId('agent-recommendation')).toContainText('Yayın geri itme anına odaklan.');
  await stopIfRunning(page);
});
