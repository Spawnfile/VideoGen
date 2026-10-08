import { tiktokErrorTr } from '@videogen/shared';

/** Plan M6 Y18: carries only the code, the HTTP status and TikTok's log id — never a header, a body or a token. */
export class TikTokError extends Error {
  readonly code: string;
  readonly http: number;
  readonly logId: string | null;
  constructor(code: string, http = 0, logId: string | null = null) {
    super(tiktokErrorTr(code, logId));
    this.name = 'TikTokError';
    this.code = code;
    this.http = http;
    this.logId = logId;
  }
  toJSON() { return { name: this.name, code: this.code, http: this.http, logId: this.logId, message: this.message }; }
}
