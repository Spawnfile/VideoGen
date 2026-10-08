import { realClock, type Clock } from './clock.ts';
import { TikTokError } from './errors.ts';
import { assertSafeBase } from './net.ts';
import type { RateGate } from './rate.ts';
import type { TokenStore } from './tokens.ts';

export type TikTokPublishStatus = 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE' | 'FAILED';

/** Y18: inbox drafts end in SEND_TO_USER_INBOX; PUBLISH_COMPLETE (Direct Post) is treated the same; anything else keeps polling. */
export function publishOutcome(status: string): 'pending' | 'sent' | 'failed' {
  if (status === 'SEND_TO_USER_INBOX' || status === 'PUBLISH_COMPLETE') return 'sent';
  if (status === 'FAILED') return 'failed';
  return 'pending';
}

const PUBLISH = '/v2/post/publish';

/**
 * Plan M6 T3: the Content Posting API on the inbox (draft) path only (Y2). Every API call passes the rate gate (Y7) and checks TikTok's
 * envelope (`error.code` other than "ok" is an error even on HTTP 200); a 401 refreshes once and repeats the call (Y17); a 429 waits 60 s and
 * repeats once — except `init`, whose repeat could open a second draft. The upload PUT goes to TikTok's upload host without Authorization.
 */
export class TikTokClient {
  private readonly clock: Clock;
  private readonly fetch: typeof fetch;

  constructor(private readonly o: { base: string; tokens: TokenStore; gate: RateGate; clock?: Clock; fetch?: typeof fetch }) {
    assertSafeBase(o.base);
    this.clock = o.clock ?? realClock;
    this.fetch = o.fetch ?? fetch;
  }

  async userInfo(): Promise<{ openId: string; displayName: string }> {
    const d = await this.call('GET', '/v2/user/info/?fields=open_id,display_name', null, true);
    return { openId: String(d?.user?.open_id ?? ''), displayName: String(d?.user?.display_name ?? '') };
  }

  async creatorInfo(): Promise<{ username: string; maxDurationS: number; privacyOptions: string[] }> {
    const d = await this.call('POST', `${PUBLISH}/creator_info/query/`, {}, true);
    return { username: String(d?.creator_username ?? ''), maxDurationS: Number(d?.max_video_post_duration_sec ?? 600), privacyOptions: (d?.privacy_level_options ?? []) as string[] };
  }

  /** Y5: a single chunk — chunk_size = video_size, one chunk. */
  async initInboxUpload(bytes: number): Promise<{ publishId: string; uploadUrl: string }> {
    const d = await this.call('POST', `${PUBLISH}/inbox/video/init/`, { source_info: { source: 'FILE_UPLOAD', video_size: bytes, chunk_size: bytes, total_chunk_count: 1 } }, false);
    const publishId = String(d?.publish_id ?? '');
    const uploadUrl = String(d?.upload_url ?? '');
    if (!publishId || !uploadUrl) throw new TikTokError('invalid_init_response', 200);
    assertSafeBase(uploadUrl);
    return { publishId, uploadUrl };
  }

  async upload(uploadUrl: string, file: Buffer, mime: string): Promise<void> {
    assertSafeBase(uploadUrl);
    const res = await this.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': mime, 'content-range': `bytes 0-${file.length - 1}/${file.length}` },
      body: new Uint8Array(file),
    });
    await res.arrayBuffer().catch(() => null);
    if (res.status !== 201 && res.status !== 200) throw new TikTokError('upload_failed', res.status);
  }

  async fetchStatus(publishId: string): Promise<{ status: TikTokPublishStatus; failReason?: string }> {
    const d = await this.call('POST', `${PUBLISH}/status/fetch/`, { publish_id: publishId }, true);
    const status = String(d?.status ?? '') as TikTokPublishStatus;
    return d?.fail_reason ? { status, failReason: String(d.fail_reason) } : { status };
  }

  private async call(method: 'GET' | 'POST', path: string, body: unknown, retry429: boolean): Promise<Record<string, any> | null> {
    let refreshed = false;
    let waited = false;
    for (;;) {
      await this.o.gate.acquire();
      const token = await this.o.tokens.accessToken();
      const res = await this.fetch(`${this.o.base}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, any> | null;
      const code = typeof j?.error?.code === 'string' ? (j.error.code as string) : null;
      const logId = typeof j?.error?.log_id === 'string' ? (j.error.log_id as string) : null;
      if ((res.status === 401 || code === 'access_token_invalid') && !refreshed) {
        refreshed = true;
        await this.o.tokens.forceRefresh(token);
        continue;
      }
      if (res.status === 429 || code === 'rate_limit_exceeded') {
        if (retry429 && !waited) { waited = true; await this.clock.sleep(60_000); continue; }
        throw new TikTokError('rate_limit_exceeded', res.status, logId);
      }
      if (code && code !== 'ok') throw new TikTokError(code, res.status, logId);
      if (!res.ok) throw new TikTokError(`http_${res.status}`, res.status, logId);
      return (j?.data ?? null) as Record<string, any> | null;
    }
  }
}
