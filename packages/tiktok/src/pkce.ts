import { createHash, randomBytes, randomInt } from 'node:crypto';

const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
export const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'] as const;

/**
 * Plan M6 Y16. TikTok-specific: `code_challenge = hex(sha256(verifier))`, not base64url (tiktok_api_developer_setup.md §3).
 * The verifier is 64 characters of the RFC 7636 alphabet; `state` is 32 random bytes in hex.
 */
export function pkce(): { verifier: string; challenge: string; state: string } {
  const verifier = Array.from({ length: 64 }, () => VERIFIER_CHARS[randomInt(VERIFIER_CHARS.length)]).join('');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('hex'), state: randomBytes(32).toString('hex') };
}

export function authorizeUrl(i: { clientKey: string; scopes: readonly string[]; redirectUri: string; state: string; challenge: string; base?: string }): string {
  const u = new URL(i.base ?? AUTHORIZE_URL);
  u.searchParams.set('client_key', i.clientKey);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', i.scopes.join(','));
  u.searchParams.set('redirect_uri', i.redirectUri);
  u.searchParams.set('state', i.state);
  u.searchParams.set('code_challenge', i.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}
