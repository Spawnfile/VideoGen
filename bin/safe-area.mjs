#!/usr/bin/env node
// Safe-area calibration (plan M7 Y15, Y16): `node bin/safe-area.mjs card [--out <dir>]` (calibration card: MP4 + PNG, default <dataDir>/calibration)
// · `show` (the stored area) · `set --top N --bottom N --right N --left N [--note "cihaz, uygulama sürümü"]` (a value read off the card's rulers).
// The card is moved to the phone by hand and shared on TikTok as "Yalnızca ben"; it never goes through VideoGen's publishing path.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { register } from 'tsx/esm/api';

register();
const { loadConfig, safeAreaWarnings, SafeAreaSchema } = await import('../packages/shared/src/index.ts');
const [cmd, ...rest] = process.argv.slice(2);
const config = loadConfig();
const USAGE = 'kullanım: node bin/safe-area.mjs card [--out <dizin>] | show | set --top N --bottom N --right N --left N [--note "…"]';
const fmt = (a) => `üst ${a.top} · alt ${a.bottom} · sağ ${a.right} · sol ${a.left} (1080×1920 px)`;

if (cmd === 'card') {
  const { values } = parseArgs({ args: rest, options: { out: { type: 'string' } } });
  const { renderSafeAreaCard } = await import('../packages/remotion/src/render.ts');
  const outDir = resolve(values.out ?? `${config.dataDir}/calibration`);
  const r = await renderSafeAreaCard({ outDir, cacheRoot: `${config.dataDir}/cache/remotion` });
  console.log(`video: ${r.mp4}\nkare:  ${r.png}`);
  console.log('Kartı telefona elle aktarın, TikTok\'ta "Yalnızca ben" ile paylaşın, akışta ekran görüntüsü alın, paylaşımı silin; cetvel değerlerini `set` ile ya da Ayarlar → Güvenli alan\'dan girin.');
} else if (cmd === 'show' || cmd === 'set') {
  const { appendAudit, createPool, getSafeArea, setSafeArea } = await import('../packages/db/src/index.ts');
  const pool = createPool(config.databaseUrl, 2);
  try {
    if (cmd === 'show') {
      const s = await getSafeArea(pool);
      console.log(`${fmt(s.area)}\nkaynak: ${s.source === 'calibrated' ? `ölçüldü ${s.measuredAt}` : 'varsayılan'}${s.note ? `\nnot: ${s.note}` : ''}`);
      for (const w of s.source === 'calibrated' ? safeAreaWarnings(s.area) : []) console.log(`uyarı: ${w}`);
    } else {
      const { values } = parseArgs({ args: rest, options: { top: { type: 'string' }, bottom: { type: 'string' }, right: { type: 'string' }, left: { type: 'string' }, note: { type: 'string' } } });
      const parsed = SafeAreaSchema.safeParse(Object.fromEntries(['top', 'bottom', 'right', 'left'].map((k) => [k, values[k] === undefined ? undefined : Number(values[k])])));
      const note = values.note?.trim().slice(0, 200) || null;
      if (!parsed.success) {
        console.error(`geçersiz güvenli alan: ${parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ')}\n${USAGE}`);
        process.exitCode = 2;
      } else {
        const from = await getSafeArea(pool);
        const to = { area: parsed.data, source: 'calibrated', measuredAt: new Date().toISOString(), note };
        await setSafeArea(pool, to);
        await appendAudit(pool, { actorType: 'user', action: 'settings.safe_area', subjectType: 'setting', subjectId: 'safe_area', data: { from, to } });
        console.log(`kaydedildi: ${fmt(to.area)}`);
        for (const w of safeAreaWarnings(to.area)) console.log(`uyarı: ${w}`);
        console.log('Not: ayar compose girdisine girer; daha önce birleştirilmiş finaller yeniden compose edilir.');
      }
    }
  } finally {
    await pool.end();
  }
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
