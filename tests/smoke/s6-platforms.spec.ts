import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_SMOKE, SMOKE_DIR } from './helpers.ts';

const ROOT = resolve(import.meta.dirname, '../..');

/** The import CLI against the smoke stack's database and data dir (video library L8–L10). */
function importOne(slug: string, product: string): void {
  const data = join(SMOKE_DIR, 'data');
  const dir = join(data, 'episodes', slug);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, 'final.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', f]);
  writeFileSync(join(dir, 'caption.txt'), `What's inside a ${product}? Hidden parts.\n\n#whatsinside`);
  const sha = createHash('sha256').update(readFileSync(f)).digest('hex');
  const manifest = join(SMOKE_DIR, `manifest-${slug}.json`);
  writeFileSync(manifest, JSON.stringify({ episodes: [{ slug, product, title: `${product} — what's inside`, language: 'en', audioMode: 'silent', approach: 'yaklasim', sha256: sha, recordedAt: new Date().toISOString() }] }));
  execFileSync('node', [join(ROOT, 'bin/import-episodes.mjs'), '--manifest', manifest, '--data-dir', data], { env: { ...process.env, VG_DATABASE_URL: APP_SMOKE, VG_DATA_DIR: data } });
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('S6: an imported episode is in the library; marked uploaded on Instagram from the Platforms tab, the badge, history and audit follow; undo clears it', async ({ page }) => {
  test.setTimeout(90_000);
  importOne('smoke-kup', 'Smoke küp');
  await page.goto('/library');
  await page.getByTestId('library-filter-not-instagram').click();
  await expect(page).toHaveURL(/\/library\?f=not-instagram$/);
  const row = page.getByTestId('library-item').filter({ hasText: 'Smoke küp' });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTestId('library-imported')).toBeVisible();
  await expect(row.getByTestId('library-badge-instagram')).toHaveAttribute('data-status', 'none');
  await row.click();
  const panel = page.getByTestId('platforms-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('save-to-phone')).toHaveAttribute('href', /\?download=smoke-kup\.mp4$/);
  await panel.getByTestId('copy-caption').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("What's inside a Smoke küp?");
  await panel.getByTestId('mark-uploaded-instagram').click();
  await page.getByTestId('mark-url').fill('https://www.instagram.com/reel/smoke123/');
  await page.getByTestId('mark-save').click();
  await expect(panel.getByTestId('platform-row-instagram')).toHaveAttribute('data-status', 'uploaded');
  await expect(panel.getByTestId('platform-history')).toContainText('Instagram · uploaded');
  await page.getByRole('link', { name: '← Library' }).click(); // in-app back keeps the chosen chip
  await expect(page.getByTestId('library-filter-not-instagram')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('library-item').filter({ hasText: 'Smoke küp' })).toHaveCount(0);
  await page.getByTestId('library-filter-all').click();
  await expect(page.getByTestId('library-item').filter({ hasText: 'Smoke küp' }).getByTestId('library-badge-instagram')).toHaveAttribute('data-status', 'uploaded');
  await page.getByTestId('library-item').filter({ hasText: 'Smoke küp' }).click();
  await panel.getByTestId('undo-instagram').click();
  await panel.getByTestId('undo-confirm-instagram').click();
  await expect(panel.getByTestId('platform-row-instagram')).toHaveAttribute('data-status', 'none');
  await expect(panel.getByTestId('platform-history')).toContainText('Instagram · undone');
  await page.goto('/audit');
  await expect(page.getByRole('row').filter({ hasText: 'platform.retracted' }).first()).toBeVisible({ timeout: 10_000 });
});
