#!/usr/bin/env node
// TikTok connection (plan M6 Y3): `node bin/tiktok.mjs import [--from ~/tiktok-poster]` moves the tiktok-poster connection into
// <dataDir>/secrets (0600) and renames the source tokens.json; `node bin/tiktok.mjs status`. Secrets are never printed.
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { loadConfig } = await import('../packages/shared/src/config.ts');
const { appendAudit, createPool } = await import('../packages/db/src/index.ts');
const { pgRateGate, TikTokClient, TokenStore } = await import('../packages/tiktok/src/index.ts');
const [cmd, ...rest] = process.argv.slice(2);
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const gate = pgRateGate(pool, { perMinute: config.tiktok.ratePerMinute });
const store = new TokenStore({ dir: join(config.dataDir, 'secrets'), pool, base: config.tiktok.base, gate });
const client = new TikTokClient({ base: config.tiktok.base, tokens: store, gate });
try {
  if (cmd === 'import') {
    const i = rest.indexOf('--from');
    const from = resolve(i >= 0 && rest[i + 1] ? rest[i + 1] : join(homedir(), 'tiktok-poster'));
    const { username } = await store.importFrom(from, async () => {
      await client.userInfo();
      return (await client.creatorInfo()).username;
    });
    const st = await store.status();
    await appendAudit(pool, { actorType: 'user', action: 'tiktok.connected', subjectType: 'setting', subjectId: 'tiktok', data: { username, scopes: st.scopes, via: 'import' } });
    console.log(`Bağlandı: @${username}; ${join(from, 'tokens.json')} taşındı (post.py artık bu token'ı kullanmaz).`);
  } else if (cmd === 'status') {
    const s = await store.status();
    console.log(s.connected ? `Bağlı: @${s.username ?? '?'} · token ${s.expiresAt} · yenileme ${s.refreshExpiresAt} · ${s.scopes.join(', ')}` : `Bağlı değil${s.clientConfigured ? '' : ' (istemci bilgisi yok)'}`);
  } else {
    console.error('kullanım: node bin/tiktok.mjs import [--from ~/tiktok-poster] | status');
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`hata: ${e instanceof Error ? e.message : 'bilinmeyen'}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
