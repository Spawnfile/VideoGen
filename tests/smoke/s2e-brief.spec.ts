import { expect, test, type Page } from '@playwright/test';

/** Brief design Y1–Y5: the Studio form, the video header and the research card in the fake pipeline ("öneri …" makes the researcher recommend 40–50 s). */
const stopIfRunning = async (page: Page) => {
  const stop = page.getByTestId('video-header').getByRole('button', { name: 'Üretimi durdur' });
  if (await stop.isVisible()) await stop.click();
};

test('S2e: the form shows the defaults; Otomatik takes the agent\'s window, shown with its source next to the brief', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'Yeni üretim' });
  await expect(bar.getByTestId('duration-badge')).toHaveText('Otomatik · ajan önerir, yoksa varsayılan 35–55 sn');
  await expect(bar).toContainText('Varsayılanlar: süre 35–55 sn');
  // A duration in the brief fills Elle as "yönergeden"; removing it goes back to Otomatik.
  const brief = bar.getByRole('textbox', { name: /Yönerge/ });
  await brief.fill('20 sn olsun');
  await expect(bar.getByTestId('duration-badge')).toHaveText('18–22 sn · yönergeden');
  await brief.fill('Yaya odaklan, tempo hızlı.');
  await expect(bar.getByTestId('duration-badge')).toHaveText(/^Otomatik/);

  await bar.getByRole('textbox', { name: 'Ürün adı' }).fill('Öneri kalemi');
  await bar.getByRole('button', { name: 'Üret' }).click();
  const header = page.getByTestId('video-header');
  await expect(header.getByTestId('video-duration')).toHaveText('35–55 sn · varsayılan', { timeout: 15_000 });
  await expect(header.getByTestId('video-brief')).toContainText('Yaya odaklan, tempo hızlı.');
  await expect(page.getByTestId('agent-recommendation')).toContainText('Ajanın süre önerisi: 40–50 sn · uygulandı', { timeout: 30_000 });
  await expect(header.getByTestId('video-duration')).toHaveText('40–50 sn · ajan önerisi');
  await expect(page.getByTestId('agent-recommendation')).toContainText('Yayın geri itme anına odaklan.');
  await stopIfRunning(page);
});

test('S2e: the user\'s window beats the agent\'s recommendation', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const bar = page.getByRole('region', { name: 'Yeni üretim' });
  await bar.getByRole('radio', { name: 'Elle' }).click();
  await bar.getByRole('spinbutton', { name: 'en az' }).fill('20');
  await bar.getByRole('spinbutton', { name: 'en çok' }).fill('25');
  await expect(bar.getByTestId('duration-badge')).toHaveText('20–25 sn · senin kararın');
  await bar.getByRole('textbox', { name: 'Ürün adı' }).fill('Öneri kalemi kısa');
  await bar.getByRole('button', { name: 'Üret' }).click();
  const header = page.getByTestId('video-header');
  await expect(header.getByTestId('video-duration')).toHaveText('20–25 sn · senin kararın', { timeout: 15_000 });
  await expect(page.getByTestId('agent-recommendation')).toContainText('uygulanmadı, senin kararın 20–25 sn geçerli', { timeout: 30_000 });
  await expect(header.getByTestId('video-duration')).toHaveText('20–25 sn · senin kararın');
  await stopIfRunning(page);
});
