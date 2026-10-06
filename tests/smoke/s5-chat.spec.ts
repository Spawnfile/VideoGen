import { expect, test } from '@playwright/test';

test('S5 (kısmi): a chat message streams a Search trace that settles into an answer; a second turn streams Coding rows', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const chat = page.getByRole('region', { name: 'Chat' });
  await chat.getByRole('button', { name: 'Yeni sohbet' }).click();
  const box = chat.getByRole('textbox', { name: 'Mesaj' });

  await box.fill('Tükenmez kalemin içinde ne var?');
  // Two Enters in the same task (one frame): only the send lock stops the second; separate press() calls would
  // arrive after the first send already cleared the box.
  await box.evaluate((el) => { for (let i = 0; i < 2; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
  const search = chat.locator('[data-testid="thinking"][data-variant="search"]').first();
  await expect(search).toHaveAttribute('data-status', 'live', { timeout: 15_000 });
  await expect(search).toHaveAttribute('data-status', 'settled', { timeout: 30_000 });
  await expect(search.getByText("Web'de arandı, 9 kaynak")).toBeVisible();
  await expect(chat.getByTestId('chat-message').filter({ hasText: /^Based on the search results/ })).toBeVisible({ timeout: 15_000 });
  await box.fill('   ');
  await box.press('Enter'); // whitespace only: nothing is sent
  await expect(chat.locator('[data-testid="chat-message"][data-role="user"]')).toHaveCount(1);
  await search.getByRole('button', { name: /Web'de arandı/ }).click();
  await expect(search.getByText('nguyeneng21007.commons.gc.cuny.edu').first()).toBeVisible();

  await box.fill('Notları bir dosyaya yaz.');
  await box.press('Enter');
  // coding.ndjson: reasoning, Write (one coding block), reasoning, Edit (another): the first coding block is the Write.
  const coding = chat.locator('[data-testid="thinking"][data-variant="coding"]').first();
  await expect(coding).toHaveAttribute('data-status', 'settled', { timeout: 30_000 });
  await coding.getByRole('button', { name: /araç çalıştırdı/ }).click();
  await expect(coding.getByText('notes.txt').first()).toBeVisible();
  await expect(coding.getByText('+3')).toBeVisible();
  await expect(chat.locator('[data-testid="chat-message"][data-role="assistant"]')).toHaveCount(2, { timeout: 15_000 });
});
