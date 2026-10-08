import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import {
  attributionLines, POLL_FAST_WINDOW_MS, POLL_INTERVAL_MS, POLL_SLOW_INTERVAL_MS, validateForTikTok, WAIT_GIVE_UP_MS, type Publication, type PublicationStatus,
} from '@videogen/shared';
import {
  advancePublication, appendAudit, claimPublication, getPublication, publishEvent, publishSource, staleQueued, unfinishedPublications, type PublicationPatch,
} from '@videogen/db';
import { publishOutcome, realClock, TikTokError, type Clock, type TikTokClient } from '@videogen/tiktok';
import { ffprobeOf } from '../render/ffmpeg.ts';
import { snapshotForPublish } from './snapshot.ts';

export interface TikTokProbe { container: string; vcodec: string; pixFmt: string; acodec: string | null; width: number; height: number; durationS: number; bytes: number }

/** Container, the first video and audio streams, duration and size: what `validateForTikTok` needs (Y5). */
export function probeForTikTok(ffmpeg: string, file: string): Promise<TikTokProbe> {
  return new Promise((resolve, reject) => {
    execFile(ffprobeOf(ffmpeg), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=format_name,duration,size', '-of', 'json', file],
      { timeout: 30_000 }, (err, stdout) => {
        if (err) return reject(new Error('ffprobe: dosya okunamadı'));
        const j = JSON.parse(String(stdout)) as { streams?: Record<string, string | number>[]; format?: Record<string, string> };
        const v = j.streams?.find((s) => s.codec_type === 'video');
        const a = j.streams?.find((s) => s.codec_type === 'audio');
        resolve({
          container: String(j.format?.format_name ?? ''), vcodec: String(v?.codec_name ?? 'yok'), pixFmt: String(v?.pix_fmt ?? 'yok'), acodec: a ? String(a.codec_name) : null,
          width: Number(v?.width ?? 0), height: Number(v?.height ?? 0), durationS: Number(j.format?.duration ?? 0), bytes: Number(j.format?.size ?? 0),
        });
      });
  });
}

const CREATOR_TTL_MS = 10 * 60_000;
const SWEEP_AFTER_MS = 15_000;
const STALE_QUEUED_MS = 3_600_000;
const SECRETLESS = (e: unknown) => (e instanceof TikTokError ? { reason: e.message, code: e.code } : { reason: `Gönderim başarısız: ${(e as Error)?.message?.split('\n')[0]?.slice(0, 200) ?? 'bilinmeyen hata'}`, code: 'error' });

export interface PublishDeps {
  pool: pg.Pool; dataDir: string; ffmpeg: string; client: TikTokClient; clock?: Clock;
  probe?: (file: string) => Promise<TikTokProbe>;
  pollMs?: number; slowPollMs?: number; sweepMs?: number;
}

/**
 * Plan M6 T4: sends queued TikTok drafts one at a time (Y7) and drives each row through its conditional state machine (Y8):
 * queued → uploading (claim) → publish_id stored → PUT → processing → sent | failed; no answer within 5 min → waiting (slow polling,
 * outside the send queue) → sent | failed after 24 h. Nothing resends automatically. `recover()` and the 30 s sweep pick up rows whose
 * command was lost or whose worker died.
 */
export class PublishService {
  private chain: Promise<void> = Promise.resolve();
  private readonly pollers = new Map<string, Promise<void>>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly clock: Clock;

  constructor(private readonly d: PublishDeps) {
    this.clock = d.clock ?? realClock;
  }

  /** The `publish.send` command: queued behind the current send. */
  send(id: string): Promise<void> {
    const next = this.chain.then(() => this.run(id));
    this.chain = next.catch(() => {});
    return next;
  }

  /** Tests: every send and poller finished. */
  async idle(): Promise<void> {
    for (;;) {
      await this.chain;
      const ps = [...this.pollers.values()];
      if (!ps.length) return;
      await Promise.allSettled(ps);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Y8 at worker start, then the periodic sweep. */
  async recover(): Promise<void> {
    for (const p of await unfinishedPublications(this.d.pool)) {
      if (p.status === 'queued') void this.send(p.id);
      else if (p.status === 'uploading' && !p.publishId) {
        await this.fail(p, ['uploading'], 'Gönderim yarıda kesildi (worker yeniden başladı). TikTok gelen kutunuzu kontrol edin, gerekirse yeniden gönderin.', 'interrupted');
      } else if (p.status === 'uploading') {
        const moved = await this.move(p, ['uploading'], { status: 'processing' });
        if (moved) this.startPolling(moved, this.clock.now());
      } else this.startPolling(p, this.clock.now());
    }
    if (!this.timer && !this.stopped) this.timer = setInterval(() => { void this.sweep().catch(() => {}); }, this.d.sweepMs ?? 30_000);
    this.timer?.unref?.();
  }

  /** Y8: a queued row older than 15 s lost its command; older than 1 h it is not sent at all. */
  async sweep(): Promise<void> {
    const now = this.clock.now();
    for (const p of await staleQueued(this.d.pool, { olderThanMs: SWEEP_AFTER_MS, now: new Date(now) })) {
      if (now - p.createdAt.getTime() > STALE_QUEUED_MS) await this.fail(p, ['queued'], 'Gönderim kuyrukta bekledi; worker çalışmıyordu. Yeniden gönderin.', 'stale');
      else void this.send(p.id);
    }
  }

  private async run(id: string): Promise<void> {
    const before = await getPublication(this.d.pool, id);
    if (!before || before.status !== 'queued') return;
    if (this.clock.now() - before.createdAt.getTime() > STALE_QUEUED_MS) {
      await this.fail(before, ['queued'], 'Gönderim kuyrukta bekledi; worker çalışmıyordu. Yeniden gönderin.', 'stale');
      return;
    }
    const p = await claimPublication(this.d.pool, id);
    if (!p) return;
    await this.note(p);
    let current: Publication = p;
    try {
      const src = await publishSource(this.d.pool, p.videoId, { versionId: p.versionId });
      if (!src) throw new Error('video bulunamadı');
      await snapshotForPublish(this.d.pool, src);
      const blob = (await this.d.pool.query('SELECT path FROM blobs WHERE sha256 = $1', [p.blobSha])).rows[0];
      if (!blob) throw new Error('video dosyası bulunamadı');
      const file = join(this.d.dataDir, blob.path as string);
      const probe = await (this.d.probe ?? ((f: string) => probeForTikTok(this.d.ffmpeg, f)))(file);
      const creator = await this.creatorInfo();
      const errors = validateForTikTok(probe, creator);
      const lic = src.soundPlan ? attributionLines(src.soundPlan, src.assets, p.variant) : { lines: [], refused: [] };
      errors.push(...lic.refused.map((t) => `${t} artık izinli değil`));
      if (errors.length) { await this.fail(p, ['uploading'], errors.join('; '), 'validation'); return; }

      const bytes = await readFile(file);
      const init = await this.d.client.initInboxUpload(bytes.length);
      current = (await this.move(p, ['uploading'], { publishId: init.publishId }, false)) ?? current;
      await this.d.client.upload(init.uploadUrl, bytes, 'video/mp4');
      const processing = await this.move(current, ['uploading'], { status: 'processing' });
      if (processing) await this.poll(processing, this.clock.now(), true);
    } catch (e) {
      const s = SECRETLESS(e);
      const latest = (await getPublication(this.d.pool, id)) ?? current;
      await this.fail(latest, ['uploading', 'processing'], s.reason, s.code);
    }
  }

  private startPolling(p: Publication, since: number): void {
    if (this.pollers.has(p.id)) return;
    const run = this.poll(p, since, false)
      .catch(async (e) => { const s = SECRETLESS(e); const latest = await getPublication(this.d.pool, p.id); if (latest) await this.fail(latest, ['processing', 'waiting'], s.reason, s.code); })
      .finally(() => { this.pollers.delete(p.id); });
    this.pollers.set(p.id, run);
  }

  /** Fast polling (10 s) for 5 min inside the send; then `waiting`, slow polling (60 s) outside it, until 24 h. */
  private async poll(p: Publication, since: number, inSend: boolean): Promise<void> {
    let row = p;
    for (;;) {
      if (this.stopped) return;
      const s = await this.d.client.fetchStatus(row.publishId!);
      const outcome = publishOutcome(s.status);
      if (outcome === 'sent') { await this.move(row, ['processing', 'waiting'], { status: 'sent', sentAt: new Date(this.clock.now()) }); return; }
      if (outcome === 'failed') {
        await this.fail(row, ['processing', 'waiting'], s.failReason ? new TikTokError(s.failReason).message : 'TikTok gönderimi reddetti.', s.failReason ?? 'failed');
        return;
      }
      const elapsed = this.clock.now() - since;
      if (elapsed >= WAIT_GIVE_UP_MS) {
        await this.fail(row, ['processing', 'waiting'], 'TikTok durumu 24 saatte netleşmedi; gelen kutunuzu kontrol edin.', 'timeout');
        return;
      }
      if (elapsed >= POLL_FAST_WINDOW_MS && row.status === 'processing') {
        row = (await this.move(row, ['processing'], { status: 'waiting' })) ?? row;
        if (inSend) { this.startPollingFrom(row, since); return; }
      }
      await this.clock.sleep(row.status === 'waiting' ? (this.d.slowPollMs ?? POLL_SLOW_INTERVAL_MS) : (this.d.pollMs ?? POLL_INTERVAL_MS));
    }
  }

  private startPollingFrom(p: Publication, since: number): void {
    this.startPolling(p, since);
  }

  /** creator_info, cached 10 min in settings (`tiktok.creator`): the API's view reads the same cache and never calls TikTok (Y5). */
  private async creatorInfo(): Promise<{ maxDurationS: number } | null> {
    const now = this.clock.now();
    const cached = (await this.d.pool.query("SELECT value FROM settings WHERE key = 'tiktok.creator'")).rows[0]?.value;
    if (cached && typeof cached.at === 'number' && now - cached.at < CREATOR_TTL_MS) return { maxDurationS: Number(cached.maxDurationS) };
    const c = await this.d.client.creatorInfo();
    await this.d.pool.query(
      "INSERT INTO settings (key, value, updated_at) VALUES ('tiktok.creator', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
      [JSON.stringify({ at: now, username: c.username, maxDurationS: c.maxDurationS, privacyOptions: c.privacyOptions })],
    );
    return { maxDurationS: c.maxDurationS };
  }

  private async fail(p: Publication, from: PublicationStatus[], reason: string, code: string): Promise<void> {
    await this.move(p, from, { status: 'failed', failReason: reason.slice(0, 500), errorCode: code });
  }

  /** A conditional transition; a status change is audited and published to the video's event topic. */
  private async move(p: Publication, from: PublicationStatus[], patch: PublicationPatch, announce = true): Promise<Publication | null> {
    const next = await advancePublication(this.d.pool, p.id, from, patch);
    if (next && announce && patch.status) await this.note(next);
    return next;
  }

  private async note(p: Publication): Promise<void> {
    await appendAudit(this.d.pool, {
      actorType: 'system', action: `publish.${p.status}`, subjectType: 'publication', subjectId: p.id,
      data: { videoId: p.videoId, versionId: p.versionId, variant: p.variant, publishId: p.publishId, ...(p.errorCode ? { errorCode: p.errorCode } : {}) },
    }).catch(() => {});
    await publishEvent(this.d.pool, { topic: `video:${p.videoId}`, type: 'publish.status', payload: { publicationId: p.id, status: p.status, failReason: p.failReason } }).catch(() => {});
  }
}
