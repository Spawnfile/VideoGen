import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Plan M6 Y20 (spec §16.1, `node:http` instead of Fastify): a fake TikTok on a random loopback port — OAuth (code + refresh with rotation),
 * user/info, creator_info, inbox init, the upload PUT (Content-Range checked) and status/fetch with a configurable sequence. Records requests.
 */
export interface MockOptions {
  /** Statuses returned by successive status/fetch calls for a publish id; the last one repeats. */
  statusSequence?: string[];
  /** init answers HTTP 200 with this error code in the envelope (e.g. spam_risk_too_many_pending_share). */
  failInit?: string | null;
  /** One-shot: the next API call answers HTTP 200 with this error code. */
  envelopeError?: string | null;
  /** One-shot: the next API call answers HTTP 429. */
  rateLimitOnce?: boolean;
  /** The refresh token the mock accepts at start (e.g. an imported one). */
  acceptRefresh?: string;
  /** Upload URLs are built on this base (default: the mock itself). */
  uploadBase?: string;
  /** Called when a PUT arrives, before it is answered (tests check what was stored before the upload). */
  onPut?: () => Promise<void> | void;
}
export interface RecordedRequest { method: string; path: string; headers: Record<string, string | string[] | undefined>; body: string; bytes: number }
export interface TikTokMock {
  base: string;
  requests: RecordedRequest[];
  tokens(): { accessToken: string; refreshToken: string };
  set(o: Partial<MockOptions>): void;
  expireAccess(): void;
  revokeRefresh(): void;
  initCount(): number;
  stop(): Promise<void>;
}

export async function startTikTokMock(opts: MockOptions = {}): Promise<TikTokMock> {
  const o: MockOptions = { statusSequence: ['PROCESSING_UPLOAD', 'SEND_TO_USER_INBOX'], ...opts };
  let gen = 1;
  let access: string | null = `act.mock.${gen}`;
  let refresh: string | null = o.acceptRefresh ?? `rft.mock.${gen}`;
  let lastAccess = access;
  let lastRefresh = refresh;
  let logs = 0;
  let inits = 0;
  const polls = new Map<string, number>();
  const uploads = new Map<string, number>();
  const requests: RecordedRequest[] = [];
  let base = '';

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const ok = (res: ServerResponse, data: unknown) => send(res, 200, { data, error: { code: 'ok', message: '', log_id: `mocklog${++logs}` } });
  const fail = (res: ServerResponse, status: number, code: string) => send(res, status, { data: {}, error: { code, message: code, log_id: `mocklog${++logs}` } });

  const issue = () => {
    gen += 1;
    access = `act.mock.${gen}`;
    refresh = `rft.mock.${gen}`;
    lastAccess = access;
    lastRefresh = refresh;
    return { access_token: access, expires_in: 86_400, refresh_token: refresh, refresh_expires_in: 31_536_000, open_id: '-000mock-open-id', scope: 'user.info.basic,video.publish,video.upload', token_type: 'Bearer' };
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    requests.push({ method: req.method ?? '', path, headers: { ...req.headers }, body: req.method === 'PUT' ? '' : raw.toString('utf8'), bytes: raw.length });

    if (path === '/v2/oauth/token/' && req.method === 'POST') {
      const f = new URLSearchParams(raw.toString('utf8'));
      if (!f.get('client_key') || !f.get('client_secret')) return send(res, 400, { error: 'invalid_client', error_description: 'missing client', log_id: `mocklog${++logs}` });
      if (f.get('grant_type') === 'authorization_code') {
        if (f.get('code') !== 'mock-code' || !f.get('code_verifier')) return send(res, 400, { error: 'invalid_grant', error_description: 'bad code', log_id: `mocklog${++logs}` });
        return send(res, 200, issue());
      }
      if (f.get('grant_type') === 'refresh_token' && refresh !== null && f.get('refresh_token') === refresh) return send(res, 200, issue());
      return send(res, 400, { error: 'invalid_grant', error_description: 'refresh token is invalid', log_id: `mocklog${++logs}` });
    }

    if (req.method === 'PUT' && path.startsWith('/upload/')) {
      const expected = uploads.get(path.slice('/upload/'.length));
      const range = req.headers['content-range'];
      await o.onPut?.();
      if (expected === undefined || raw.length !== expected || range !== `bytes 0-${expected - 1}/${expected}`) return send(res, 400, { error: 'bad upload' });
      res.writeHead(201);
      return res.end();
    }

    // API calls: Authorization first, then one-shot faults.
    if (req.headers.authorization !== `Bearer ${access}` || access === null) return fail(res, 401, 'access_token_invalid');
    if (o.rateLimitOnce) { o.rateLimitOnce = false; return fail(res, 429, 'rate_limit_exceeded'); }
    if (o.envelopeError) { const code = o.envelopeError; o.envelopeError = null; return fail(res, 200, code); }

    if (path === '/v2/user/info/' && req.method === 'GET') return ok(res, { user: { open_id: '-000mock-open-id', display_name: "What's Inside ?" } });
    if (path === '/v2/post/publish/creator_info/query/') {
      return ok(res, { creator_username: 'whats.inside59', creator_nickname: "What's Inside ?", privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], max_video_post_duration_sec: 600 });
    }
    if (path === '/v2/post/publish/inbox/video/init/') {
      if (o.failInit) return fail(res, 200, o.failInit);
      const si = (JSON.parse(raw.toString('utf8') || '{}') as { source_info?: { video_size?: number; chunk_size?: number; total_chunk_count?: number } }).source_info;
      if (!si?.video_size || si.chunk_size !== si.video_size || si.total_chunk_count !== 1) return fail(res, 400, 'invalid_params');
      inits += 1;
      const id = String(inits);
      uploads.set(id, si.video_size);
      return ok(res, { publish_id: `v_inbox_file~v2.${id}`, upload_url: `${o.uploadBase ?? base}/upload/${id}` });
    }
    if (path === '/v2/post/publish/status/fetch/') {
      const id = String((JSON.parse(raw.toString('utf8') || '{}') as { publish_id?: string }).publish_id ?? '');
      const n = polls.get(id) ?? 0;
      polls.set(id, n + 1);
      const seq = o.statusSequence!;
      const status = seq[Math.min(n, seq.length - 1)]!;
      return ok(res, status === 'FAILED' ? { status, fail_reason: 'file_format_check_failed' } : { status });
    }
    return fail(res, 404, 'not_found');
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    requests,
    tokens: () => ({ accessToken: lastAccess!, refreshToken: lastRefresh! }),
    set: (p) => { Object.assign(o, p); },
    expireAccess: () => { access = null; },
    revokeRefresh: () => { refresh = null; },
    initCount: () => inits,
    stop: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
