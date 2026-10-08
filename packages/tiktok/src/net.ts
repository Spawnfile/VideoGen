const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Plan M6 Y19: TikTok endpoints and upload URLs must be https; plain http only on loopback (the mock server). */
export function assertSafeBase(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`TikTok adresi geçersiz: ${raw.slice(0, 80)}`); }
  if (u.protocol === 'https:') return u;
  if (u.protocol === 'http:' && LOOPBACK.has(u.hostname)) return u;
  throw new Error(`TikTok adresi https olmalı (yalnızca loopback http olabilir): ${u.origin}`);
}
