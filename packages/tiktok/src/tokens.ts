import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { LOCK_TIKTOK_TOKENS, VG_LOCK_NS } from '@videogen/db';
import { realClock, type Clock } from './clock.ts';
import { TikTokError } from './errors.ts';
import { assertSafeBase } from './net.ts';
import type { RateGate } from './rate.ts';

export const TOKENS_FILE = 'tiktok-tokens.json';
export const CLIENT_FILE = 'tiktok-client.json';
const REFRESH_MARGIN_MS = 10 * 60_000;
const YEAR_MS = 365 * 86_400_000;

export interface Tokens {
  accessToken: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number; openId: string; scope: string; username: string | null;
}
export interface ClientCredentials { clientKey: string; clientSecret: string }
export interface ConnectionStatus {
  connected: boolean; username: string | null; expiresAt: string | null; refreshExpiresAt: string | null; scopes: string[]; clientConfigured: boolean;
}

interface OAuthResponse { access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; open_id: string; scope: string }

const toFile = (t: Tokens) => ({
  access_token: t.accessToken, refresh_token: t.refreshToken, expires_at: t.expiresAt, refresh_expires_at: t.refreshExpiresAt,
  open_id: t.openId, scope: t.scope, username: t.username,
});
const fromFile = (j: Record<string, any>): Tokens => ({
  accessToken: String(j.access_token), refreshToken: String(j.refresh_token), expiresAt: Number(j.expires_at), refreshExpiresAt: Number(j.refresh_expires_at),
  openId: String(j.open_id ?? ''), scope: String(j.scope ?? ''), username: j.username ?? null,
});

/** Atomic: a temp file in the same dir (0600), fsync, rename. The dir is 0700. A reader never sees a torn file. */
async function writeSecret(dir: string, name: string, data: unknown): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const tmp = join(dir, `.${name}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  const fh = await open(tmp, 'wx', 0o600);
  try {
    await fh.writeFile(`${JSON.stringify(data, null, 2)}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, join(dir, name));
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

async function readJson(path: string): Promise<Record<string, any> | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>; } catch { return null; }
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return out;
}

const absMs = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? (v < 1e12 ? v * 1000 : v) : null);

/**
 * Plan M6 Y3/Y17: VideoGen owns the TikTok tokens (`<dataDir>/secrets`, 0600). Read-refresh-write happens under one advisory lock, so the
 * API (connect) and the worker (refresh) never interleave; a token is refreshed once for concurrent callers. Nothing here logs a secret.
 */
export class TokenStore {
  private readonly clock: Clock;
  private readonly fetch: typeof fetch;
  private inflight: Promise<string> | null = null;

  constructor(private readonly o: { dir: string; pool: pg.Pool; base: string; clock?: Clock; fetch?: typeof fetch; gate?: RateGate }) {
    assertSafeBase(o.base);
    this.clock = o.clock ?? realClock;
    this.fetch = o.fetch ?? fetch;
  }

  get dir(): string { return this.o.dir; }

  async client(): Promise<ClientCredentials | null> {
    const j = await readJson(join(this.o.dir, CLIENT_FILE));
    return j?.client_key && j.client_secret ? { clientKey: String(j.client_key), clientSecret: String(j.client_secret) } : null;
  }

  async writeClient(c: ClientCredentials): Promise<void> {
    await writeSecret(this.o.dir, CLIENT_FILE, { client_key: c.clientKey, client_secret: c.clientSecret });
  }

  async read(): Promise<Tokens | null> {
    const j = await readJson(join(this.o.dir, TOKENS_FILE));
    return j?.access_token && j.refresh_token ? fromFile(j) : null;
  }

  async write(t: Tokens): Promise<void> {
    await writeSecret(this.o.dir, TOKENS_FILE, toFile(t));
  }

  async status(): Promise<ConnectionStatus> {
    const [t, c] = await Promise.all([this.read(), this.client()]);
    const now = this.clock.now();
    return {
      connected: !!t && t.refreshExpiresAt > now,
      username: t?.username ?? null,
      expiresAt: t ? new Date(t.expiresAt).toISOString() : null,
      refreshExpiresAt: t ? new Date(t.refreshExpiresAt).toISOString() : null,
      scopes: t ? t.scope.split(/[,\s]+/).filter(Boolean).sort() : [],
      clientConfigured: !!c,
    };
  }

  /** A valid access token; refreshed first when it expires within 10 minutes. */
  async accessToken(o: { minValidityMs?: number } = {}): Promise<string> {
    const t = await this.read();
    if (!t) throw new TikTokError('not_connected');
    if (t.expiresAt - this.clock.now() > (o.minValidityMs ?? REFRESH_MARGIN_MS)) return t.accessToken;
    return this.refresh(null);
  }

  /** Y17: after a 401 for `failed` — refresh unless another caller already did. */
  forceRefresh(failed: string): Promise<string> {
    return this.refresh(failed);
  }

  private refresh(failed: string | null): Promise<string> {
    if (!this.inflight) this.inflight = this.refreshLocked(failed).finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const c = await this.o.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock($1, $2)', [VG_LOCK_NS, LOCK_TIKTOK_TOKENS]);
      const out = await fn();
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  private async refreshLocked(failed: string | null): Promise<string> {
    return this.withLock(async () => {
      const cur = await this.read();
      if (!cur) throw new TikTokError('not_connected');
      const now = this.clock.now();
      const fresh = failed === null ? cur.expiresAt - now > REFRESH_MARGIN_MS : cur.accessToken !== failed;
      if (fresh) return cur.accessToken;
      if (cur.refreshExpiresAt <= now) throw new TikTokError('reconnect_required');
      const next = await this.oauth({ grant_type: 'refresh_token', refresh_token: cur.refreshToken }).catch((e: unknown) => {
        if (e instanceof TikTokError && e.code === 'rate_limit_exceeded') throw e;
        throw new TikTokError('reconnect_required', e instanceof TikTokError ? e.http : 0, e instanceof TikTokError ? e.logId : null);
      });
      await this.write({ ...this.fromOAuth(next, now), username: cur.username });
      return next.access_token;
    });
  }

  /** Y16: the authorization code of the PKCE callback → tokens (written under the lock). */
  async exchangeCode(code: string, verifier: string, redirectUri: string): Promise<Tokens> {
    return this.withLock(async () => {
      const r = await this.oauth({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
      const t = { ...this.fromOAuth(r, this.clock.now()), username: null };
      await this.write(t);
      return t;
    });
  }

  async setUsername(username: string): Promise<void> {
    await this.withLock(async () => {
      const t = await this.read();
      if (t) await this.write({ ...t, username });
    });
  }

  /**
   * Y3: move (not copy) the tiktok-poster connection: client key/secret from `.env`, tokens from `tokens.json`. Ours is written first; the
   * access token is refreshed at once when its absolute expiry is unknown; `verify` (creator_info) names the account; only then is the source
   * `tokens.json` renamed, so `post.py` fails loudly instead of using a token that rotation made stale.
   */
  async importFrom(posterDir: string, verify: () => Promise<string>): Promise<{ username: string }> {
    const env = parseEnv(await readFile(join(posterDir, '.env'), 'utf8').catch(() => { throw new Error(`${posterDir}/.env okunamadı`); }));
    const key = env.TIKTOK_CLIENT_KEY ?? '';
    const secret = env.TIKTOK_CLIENT_SECRET ?? '';
    if (key.length !== 18) throw new Error('TIKTOK_CLIENT_KEY 18 karakter olmalı');
    if (secret.length !== 32) throw new Error('TIKTOK_CLIENT_SECRET 32 karakter olmalı');
    const src = join(posterDir, 'tokens.json');
    const j = await readJson(src);
    if (!j?.access_token || !j.refresh_token) throw new Error(`${src} okunamadı ya da token içermiyor`);
    const now = this.clock.now();
    const obtained = absMs(j.obtained_at) ?? absMs(j.created_at);
    const expiresAt = absMs(j.expires_at) ?? (obtained && typeof j.expires_in === 'number' ? obtained + j.expires_in * 1000 : 0);
    const refreshExpiresAt = absMs(j.refresh_expires_at)
      ?? (obtained && typeof j.refresh_expires_in === 'number' ? obtained + j.refresh_expires_in * 1000 : now + (typeof j.refresh_expires_in === 'number' ? j.refresh_expires_in * 1000 : YEAR_MS));
    await this.writeClient({ clientKey: key, clientSecret: secret });
    await this.withLock(() => this.write({
      accessToken: String(j.access_token), refreshToken: String(j.refresh_token), expiresAt, refreshExpiresAt,
      openId: String(j.open_id ?? ''), scope: String(j.scope ?? ''), username: null,
    }));
    await this.accessToken();
    const username = await verify();
    await this.setUsername(username);
    const day = new Date(now).toISOString().slice(0, 10).replaceAll('-', '');
    await rename(src, join(posterDir, `tokens.videogen-tasindi-${day}.json`));
    return { username };
  }

  private fromOAuth(r: OAuthResponse, now: number): Omit<Tokens, 'username'> {
    return {
      accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: now + r.expires_in * 1000, refreshExpiresAt: now + r.refresh_expires_in * 1000,
      openId: r.open_id, scope: r.scope,
    };
  }

  private async oauth(params: Record<string, string>): Promise<OAuthResponse> {
    const c = await this.client();
    if (!c) throw new TikTokError('not_connected');
    await this.o.gate?.acquire();
    const res = await this.fetch(`${this.o.base}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: c.clientKey, client_secret: c.clientSecret, ...params }).toString(),
    });
    const j = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (res.status === 429) throw new TikTokError('rate_limit_exceeded', 429, j?.log_id ?? null);
    if (!res.ok || !j?.access_token) throw new TikTokError(String(j?.error ?? `http_${res.status}`), res.status, j?.log_id ?? null);
    return j as OAuthResponse;
  }
}
