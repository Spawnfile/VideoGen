#!/usr/bin/env node
// App icons from the master SVG (apps/web/design/app-icon.svg), rendered by system Chrome; the PNGs are committed.
//   node bin/icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'apps/web/public/icons');
const master = readFileSync(join(ROOT, 'apps/web/design/app-icon.svg'), 'utf8');
// Home screens cut their own corners (iOS) or apply a mask (Android maskable): those get the art full bleed.
const fullBleed = master.replace(/rx="228"/g, 'rx="0"').replace(/<rect x="3" y="3"[^>]*\/>/, '');
const favicon = readFileSync(join(ROOT, 'apps/web/public/favicon.svg'), 'utf8');

const jobs = [
  { file: 'icon-192.png', svg: master, size: 192 },
  { file: 'icon-512.png', svg: master, size: 512 },
  { file: 'icon-maskable-512.png', svg: fullBleed, size: 512 },
  { file: 'apple-touch-icon-180.png', svg: fullBleed, size: 180 },
  { file: 'favicon-32.png', svg: favicon, size: 32 },
];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const j of jobs) {
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${j.svg.replace('<svg ', `<svg width="${j.size}" height="${j.size}" `)}</body></html>`);
  writeFileSync(join(OUT, j.file), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: j.size, height: j.size } }));
  console.log(`icons/${j.file}`);
}
await browser.close();
