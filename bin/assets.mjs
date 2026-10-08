#!/usr/bin/env node
// Asset ledger (spec §9, plan E13): `node bin/assets.mjs add --kind music --file … --title … --license CC0-1.0 --author … --license-text …` · `node bin/assets.mjs list`
// · `node bin/assets.mjs revoke <id> --reason "…"` (plan M7 Y8: not undone; the narrator's own reference resets to the stock voice)
import { resolve } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { loadConfig } = await import('../packages/shared/src/config.ts');
const { createPool, isUuid, listAssets, revokeAssetAudited } = await import('../packages/db/src/index.ts');
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
    for (const a of await listAssets(pool)) console.log(`${a.allowed ? '✓' : a.revokedAt ? '⊘' : '✗'} ${a.kind}\t${a.licenseSpdx}\t${a.title}\t${a.author}\t${a.id}`);
  } else if (cmd === 'revoke' && rest[0] && rest[1] === '--reason' && rest[2]?.trim()) {
    const r = isUuid(rest[0]) ? await revokeAssetAudited(pool, rest[0], rest[2].trim()) : { kind: 'missing' };
    if (r.kind === 'missing') { console.error(`varlık bulunamadı: ${rest[0]}`); process.exitCode = 3; }
    else if (r.kind === 'already') { console.error(`zaten geri alınmış: ${r.asset.title} (${r.asset.id})`); process.exitCode = 3; }
    else console.log(`izin geri alındı: ${r.asset.title} (${r.asset.id})${r.narratorReset ? ' · anlatıcı sesi hazır sese döndü' : ''}`);
  } else {
    console.error('kullanım: node bin/assets.mjs add --kind music|sfx|voice_ref --file F --title T --license SPDX --author A --license-text L [--source URL] [--attribution M] [--tags a,b] | list | revoke <id> --reason "…"\n  voice_ref: kendi sesinizin kaydı, --license LicenseRef-Own-Voice (yalnızca bu tür için izinli)');
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
