#!/usr/bin/env node
// Asset ledger (spec §9, plan E13): `node bin/assets.mjs add --kind music --file … --title … --license CC0-1.0 --author … --license-text …` · `node bin/assets.mjs list`
import { resolve } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { loadConfig } = await import('../packages/shared/src/config.ts');
const { createPool, listAssets } = await import('../packages/db/src/index.ts');
const { importAsset, parseAddArgs } = await import('../apps/worker/src/assets.ts');
const [cmd, ...rest] = process.argv.slice(2);
const config = loadConfig();
const pool = createPool(config.adminDatabaseUrl);
try {
  if (cmd === 'add') {
    const i = parseAddArgs(rest);
    const a = await importAsset(pool, config.dataDir, config.render.ffmpeg, { ...i, file: resolve(i.file), licenseTextFile: resolve(i.licenseTextFile) });
    console.log(a.allowed ? `eklendi: ${a.title} (${a.licenseSpdx}) ${a.id}` : `REDDEDİLDİ (izinsiz lisans, kaydedildi): ${a.title} (${a.licenseSpdx})`);
    process.exitCode = a.allowed ? 0 : 3;
  } else if (cmd === 'list') {
    for (const a of await listAssets(pool)) console.log(`${a.allowed ? '✓' : '✗'} ${a.kind}\t${a.licenseSpdx}\t${a.title}\t${a.author}`);
  } else {
    console.error('kullanım: node bin/assets.mjs add --kind music|sfx|voice_ref --file F --title T --license SPDX --author A --license-text L [--source URL] [--attribution M] [--tags a,b] | list\n  voice_ref: kendi sesinizin kaydı, --license LicenseRef-Own-Voice (yalnızca bu tür için izinli)');
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
