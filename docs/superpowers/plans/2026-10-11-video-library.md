# Video Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Episodes made outside the pipeline live in VideoGen's library; every video can be watched, saved to the phone and tracked per platform (YouTube, Instagram, TikTok) with an append-only, audited upload log; TikTok API publishing is gone.

**Architecture:** One migration (0013) drops `publications`, adds four `videos` columns and the append-only `platform_uploads` table. Pure rules (platform state derivation, slugs, YouTube title, manifest schema) live in `@videogen/shared`; DB writes (platform events, text edits, episode import) in `@videogen/db`, each in one transaction with audit + `video.updated`. A thin Fastify route file and a CLI (`bin/import-episodes.mjs`) sit on top; the web gets a pure `platform-view.ts` plus a Platforms tab and library chips.

**Tech Stack:** TypeScript (node 24, tsx), Postgres 17 + drizzle migrations, Fastify, React 19 + TanStack Query + Tailwind, vitest, Playwright smoke, ffmpeg/ffprobe.

**Spec:** `docs/superpowers/specs/2026-10-11-video-library-design.md` (decisions L1–L25).

## Global Constraints

- VideoGen must not reference or read `~/icinde-ne-var` after this work; the only allowed occurrences of the string `icinde-ne-var` in tracked files are under `docs/superpowers/**` and `docs/m5/**`. The folder itself is never modified or deleted.
- Platforms: exactly `youtube`, `instagram`, `tiktok`. Actions: `uploaded`, `retracted`. `platform_uploads` is append-only (`REVOKE UPDATE, DELETE, TRUNCATE ... FROM videogen_app`).
- Limits: `caption` ≤ 2200, `youtubeTitle` ≤ 100, `url` ≤ 500 and `https://` only, `note` ≤ 500, `uploadedAt` at most 5 minutes in the future. Empty text is stored as `null`.
- Download name: `<slug>.mp4`, slug matches `^[a-z0-9][a-z0-9-]{0,59}$` (Turkish letters transliterated), fallback `video`.
- Imported videos: `origin='import'`, run `kind='import'`, `trigger='cli'`, `status='done'`; never editable by the pipeline (audio edit → 409).
- UI copy is English (the `no-turkish-ui` test must keep passing); DB-layer error strings follow the existing Turkish-in-db, English-in-API mapping.
- Each task ends with `npm run typecheck` and the touched test files green; run vitest with `VG_TEST_WORKERS=4` when the machine is loaded. Clean leaked temp dirs with `find /tmp -maxdepth 1 -name 'vg-*' -user alper -exec rm -rf {} +` if `/tmp` fills.
- Commits end with the session's `Co-Authored-By` / `Claude-Session` lines.

## Review Focus

1. Marking from the phone while the desktop library is open: the desktop row's badge must change without a reload (`video.updated` in the same transaction) — pinned in Task 3's db test asserting a `video.updated` ui_event row.
2. A video re-produced after it was uploaded: the badge must say "outdated" and `Not on X` must include it — pinned in Task 2 (`summarizePlatforms`) and Task 7 (`matchesFilter`).
3. iPhone "Save to phone": share must run on a second, fresh tap after the file is fetched; a user cancel is silent — pinned in Task 7 (`saveMode`, `shareFailure`).
4. Running the importer twice or after a half-copied file: no duplicate rows, corrupt file rejected — pinned in Task 4 (idempotency + sha mismatch tests).
5. GC after the drop of `publications`: `unwiredShaColumns` empty and imported blobs never candidates — pinned in Task 2's migration test.

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/shared/src/platforms.ts` (new) | Platform ids, limits, `PlatformSummary` types, `summarizePlatforms`, `fileSlug`, `youtubeTitleFrom` |
| `packages/shared/src/episodes.ts` (new) | `EpisodeEntrySchema`, `EpisodeManifestSchema` (zod) |
| `packages/shared/src/pipeline.ts` | `VideoView` gains `origin/approach/caption/youtubeTitle/platforms`; `RunKind` + `import`; `VideoStatus` − `published`; `VersionView.published` removed |
| `packages/db/drizzle/0013_video_library.sql` (+ meta) | drop `publications` (guarded), new columns, `platform_uploads` |
| `packages/db/src/platforms.ts` (new) | `recordPlatformEvent`, `listPlatformEvents`, `setVideoText` |
| `packages/db/src/episodes.ts` (new) | `importEpisode` |
| `packages/db/src/pipeline.ts` | `VIDEO_SQL` platform columns; `createAudioEditRun` import guard; `updateVideo` without `published` |
| `packages/db/src/locks.ts` (new) | `VG_LOCK_NS` (moved from deleted `publish.ts`) |
| `apps/api/src/routes/platforms.ts` (new) | GET/POST platforms, PATCH text |
| `bin/import-episodes.mjs` (new) | CLI: manifest → ffprobe/cover → `importEpisode` |
| `episodes/` (new) | copied episode sources, `manifest.json`, `README.md` |
| `docs/approach/` (new) | `YAKLASIM.md`, `prompt-*.md` |
| `apps/web/src/lib/platform-view.ts` (new) | labels, filters, save-mode logic, download name |
| `apps/web/src/components/platforms/{PlatformsPanel,SaveToPhone,MarkUploadedSheet,VideoText}.tsx` (new) | Platforms tab UI |
| `tests/repo-hygiene.test.ts` → `packages/shared/test/repo-hygiene.test.ts` (new) | old-folder string allowlist, `episodes/` outside tsconfig/vitest |
| `tests/smoke/s6-platforms.spec.ts` (replaces `s6-publish.spec.ts`) | import → mark → badge → undo |

---

### Task 1: Remove TikTok API publishing

**Files:**
- Delete: `packages/tiktok/`, `apps/api/src/routes/tiktok.ts`, `apps/api/src/routes/publish.ts`, `apps/worker/src/publish/`, `apps/worker/src/dev/seed-ready.ts`, `packages/db/src/publish.ts`, `packages/shared/src/publish.ts`, `apps/web/src/components/publish/`, `apps/web/src/components/settings/TikTokSection.tsx`, `apps/web/src/lib/publish-view.ts`, `bin/tiktok.mjs`, `tiktok_api_developer_setup.md`, `tiktok_api_hesap_baglantisi.md`, `tiktok_api_kullanim.md`, `apps/api/test/tiktok.test.ts`, `apps/api/test/publish.test.ts`, `apps/worker/test/publish-service.test.ts`, `packages/db/test/publish.test.ts`, `packages/shared/test/publish.test.ts`, `apps/web/test/publish-view.test.ts`, `tests/fixtures/tiktok/`, `tests/smoke/s6-publish.spec.ts`
- Create: `packages/db/src/locks.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/package.json`, `apps/worker/package.json`, `apps/worker/src/main.ts`, `packages/db/src/index.ts`, `packages/db/src/blobs.ts` (comment), `packages/db/test/helpers.ts`, `packages/shared/src/index.ts`, `packages/shared/src/browser.ts`, `packages/shared/src/maintenance.ts`, `packages/shared/src/config.ts`, `packages/claude/src/guard.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/i18n.ts`, `apps/web/test/i18n.test.ts`, `apps/web/src/routes/Settings.tsx`, `apps/web/src/components/production/ProductionPanel.tsx`, `apps/web/src/routes/LibraryDetail.tsx`, `apps/web/src/components/library/DetailTabs.tsx`, `tests/smoke/stack.mjs`, `tests/smoke/playwright.config.ts` (if it lists s6)

**Interfaces:**
- Produces: `VG_LOCK_NS` exported from `packages/db/src/locks.ts` and re-exported from `@videogen/db`; `DAY_MS` exported from `packages/shared/src/maintenance.ts`.
- The `publish` detail tab is removed here; Task 8 adds `platforms`.

- [ ] **Step 1: Move the two shared constants before deleting their files**

`packages/db/src/locks.ts`:
```ts
/** Advisory lock namespace for VideoGen's fixed lock keys (blob store, test template). */
export const VG_LOCK_NS = 0x5647; // "VG"
```
In `packages/db/src/index.ts` replace `export * from './publish.ts';` with `export * from './locks.ts';`. In `packages/db/test/helpers.ts` import `VG_LOCK_NS` from `'../src/locks.ts'`. In `packages/shared/src/maintenance.ts` replace `import { DAY_MS } from './publish.ts';` with `export const DAY_MS = 86_400_000;` and drop `publish.ts` from `shared/src/index.ts` and `browser.ts`. Grep for any other `DAY_MS` import and point it at `maintenance.ts`.

- [ ] **Step 2: Delete the files listed above**

```bash
git rm -rq packages/tiktok apps/api/src/routes/tiktok.ts apps/api/src/routes/publish.ts apps/worker/src/publish apps/worker/src/dev/seed-ready.ts \
  packages/db/src/publish.ts packages/shared/src/publish.ts apps/web/src/components/publish apps/web/src/components/settings/TikTokSection.tsx \
  apps/web/src/lib/publish-view.ts bin/tiktok.mjs tiktok_api_developer_setup.md tiktok_api_hesap_baglantisi.md tiktok_api_kullanim.md \
  apps/api/test/tiktok.test.ts apps/api/test/publish.test.ts apps/worker/test/publish-service.test.ts packages/db/test/publish.test.ts \
  packages/shared/test/publish.test.ts apps/web/test/publish-view.test.ts tests/fixtures/tiktok tests/smoke/s6-publish.spec.ts
```

- [ ] **Step 3: Unwire the deleted code until `npm run typecheck` is clean**

- `apps/api/src/app.ts`: drop the `registerTikTokRoutes`/`registerPublishRoutes` imports and calls and the `tiktokConnectTtlMs` dep.
- `apps/worker/src/main.ts`: drop the `@videogen/tiktok` import, the publish service construction, the `'publish.send'` job handler and any dev seed wiring.
- `apps/api/package.json`, `apps/worker/package.json`: remove `"@videogen/tiktok"`; run `npm install` to refresh the lockfile.
- `packages/shared/src/config.ts`: remove the `tiktok` block and every `VG_TIKTOK_*` read from `Config`/`loadConfig`.
- `packages/claude/src/guard.ts`: remove the `'tiktok-poster'` entry.
- `apps/web/src/lib/api.ts`: remove `publishInfo, publish, markPublished, cancelPublication, exportShorts, tiktok, tiktokConnect, tiktokTest` and the `publish-view`/`Publication` imports.
- `apps/web/src/lib/i18n.ts`: remove `PUBLICATION_STATUS_EN`, `CHECKLIST_EN`, `markBlocker`; `apps/web/test/i18n.test.ts`: remove their imports, the `PUBLICATION_STATUSES`/`publishChecklist` loop and the whole `markBlocker` test.
- `apps/web/src/routes/Settings.tsx`: remove the TikTok section (lines importing/rendering `TikTokSection` and its nav entry).
- `ProductionPanel.tsx`: remove `FinishCard`.
- `DetailTabs.tsx`: remove `'publish'` from `DetailTab` and `DETAIL_TABS`; `LibraryDetail.tsx`: remove the publish branch and `PublishPanel` import.
- `tests/smoke/stack.mjs`: remove the fake TikTok server block and its env.

Run: `grep -rn "tiktok" --include=*.ts --include=*.tsx --include=*.mjs apps packages bin tests | grep -iv "safe.area\|safeArea\|final_video_tiktok\|tiktokSha\|SafeAreaCard"`
Expected: only TikTok-safe-area / variant hits (L24) remain.

- [ ] **Step 4: Typecheck and run the full unit suite**

Run: `npm run typecheck && VG_TEST_WORKERS=4 npm test`
Expected: PASS. (`VersionView.published` and the `publications` SQL in `versions.ts` still compile; they go in Task 2 with the table.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove TikTok API publishing — package, routes, worker service, publish UI, settings, CLI, docs and tests (spec L23)"
```

---

### Task 2: Migration 0013, shared platform rules, GC and status cleanup

**Files:**
- Create: `packages/shared/src/platforms.ts`, `packages/shared/test/platforms.test.ts`, `packages/db/drizzle/0013_video_library.sql` (+ `meta/0013_snapshot.json`, journal entry), `packages/db/test/video-library-migration.test.ts`
- Modify: `packages/db/src/schema.ts`, `packages/shared/src/pipeline.ts`, `packages/shared/src/index.ts`, `packages/shared/src/browser.ts`, `packages/db/src/versions.ts`, `packages/db/src/pipeline.ts` (`updateVideo`, `VIDEO_SQL`, `toVideo`), `packages/db/src/gc.ts:31`, `apps/web/src/lib/i18n.ts` (`VIDEO_STATUS_EN`), every web/db file using `'published'` status (`grep -rn "'published'" apps packages`)

**Interfaces:**
- Produces (shared):
```ts
export const PLATFORMS = ['youtube', 'instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_ACTIONS = ['uploaded', 'retracted'] as const;
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];
export type PlatformStatus = 'none' | 'uploaded' | 'outdated';
export interface PlatformState { status: PlatformStatus; uploadedAt: string | null; url: string | null; versionId: string | null }
export type PlatformSummary = Record<Platform, PlatformState>;
export interface PlatformLatest { action: PlatformAction; versionId: string; uploadedAt: string; url: string | null }
export interface PlatformEvent { id: number; platform: Platform; action: PlatformAction; versionId: string; uploadedAt: string; url: string | null; note: string | null; createdAt: string }
export const CAPTION_MAX = 2200, YOUTUBE_TITLE_MAX = 100, PLATFORM_URL_MAX = 500, PLATFORM_NOTE_MAX = 500, FUTURE_SLACK_MS = 300_000;
export function summarizePlatforms(latest: Partial<Record<Platform, PlatformLatest>>, bestVersionId: string | null): PlatformSummary;
export function fileSlug(name: string): string;
export function youtubeTitleFrom(caption: string): string | null;
export type VideoOrigin = 'pipeline' | 'import';
export type VideoApproach = 'yaklasim';
```
- `VideoView` gains `origin: VideoOrigin; approach: VideoApproach | null; caption: string | null; youtubeTitle: string | null; platforms: PlatformSummary`.
- `RunKind` gains `'import'`; `VideoStatus` loses `'published'`; `VersionView` loses `published`.

- [ ] **Step 1: Write the failing shared tests** (`packages/shared/test/platforms.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { fileSlug, summarizePlatforms, youtubeTitleFrom } from '../src/index.ts';

const up = (versionId: string, at = '2026-10-11T10:00:00.000Z') => ({ action: 'uploaded' as const, versionId, uploadedAt: at, url: null });

describe('platform rules (spec L14, L19, L12)', () => {
  it('summarizePlatforms: none without events, uploaded on the best version, outdated on an older one, none after a retract; platforms independent', () => {
    expect(summarizePlatforms({}, 'v1')).toEqual({
      youtube: { status: 'none', uploadedAt: null, url: null, versionId: null },
      instagram: { status: 'none', uploadedAt: null, url: null, versionId: null },
      tiktok: { status: 'none', uploadedAt: null, url: null, versionId: null },
    });
    const s = summarizePlatforms({ youtube: up('v1'), instagram: up('v0'), tiktok: { ...up('v1'), action: 'retracted' } }, 'v1');
    expect(s.youtube).toEqual({ status: 'uploaded', uploadedAt: '2026-10-11T10:00:00.000Z', url: null, versionId: 'v1' });
    expect(s.instagram.status).toBe('outdated');
    expect(s.tiktok.status).toBe('none');
    expect(summarizePlatforms({ youtube: up('v1') }, null).youtube.status).toBe('uploaded');
  });

  it('fileSlug transliterates Turkish, lowercases, dashes the rest, caps at 60 and falls back to video', () => {
    expect(fileSlug('Kulaklık')).toBe('kulaklik');
    expect(fileSlug('PS5 Kol')).toBe('ps5-kol');
    expect(fileSlug('İğne & Çuvaldız')).toBe('igne-cuvaldiz');
    expect(fileSlug("Rubik's cube")).toBe('rubik-s-cube');
    expect(fileSlug('!!!')).toBe('video');
    expect(fileSlug('a'.repeat(80))).toHaveLength(60);
    expect(fileSlug('-x-')).toBe('x');
  });

  it('youtubeTitleFrom keeps the first sentence without hashtags or emoji, cut at a word boundary within 100', () => {
    expect(youtubeTitleFrom("How a Rubik's cube actually holds itself together. No glue, no magnets.\n\n#rubikscube"))
      .toBe("How a Rubik's cube actually holds itself together.");
    expect(youtubeTitleFrom("What's inside a Rubik's cube? 🤯 No glue")).toBe("What's inside a Rubik's cube?");
    const long = youtubeTitleFrom(`${'word '.repeat(40)}end.`)!;
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith(' ')).toBe(false);
    expect(youtubeTitleFrom('#only #tags')).toBeNull();
    expect(youtubeTitleFrom('   ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run packages/shared/test/platforms.test.ts`
Expected: FAIL (`summarizePlatforms` is not exported).

- [ ] **Step 3: Implement `packages/shared/src/platforms.ts`** and export it from `index.ts` and `browser.ts`

```ts
export const PLATFORMS = ['youtube', 'instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_ACTIONS = ['uploaded', 'retracted'] as const;
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];
export type PlatformStatus = 'none' | 'uploaded' | 'outdated';
export interface PlatformState { status: PlatformStatus; uploadedAt: string | null; url: string | null; versionId: string | null }
export type PlatformSummary = Record<Platform, PlatformState>;
export interface PlatformLatest { action: PlatformAction; versionId: string; uploadedAt: string; url: string | null }
export interface PlatformEvent { id: number; platform: Platform; action: PlatformAction; versionId: string; uploadedAt: string; url: string | null; note: string | null; createdAt: string }
export type VideoOrigin = 'pipeline' | 'import';
export type VideoApproach = 'yaklasim';

/** Spec L16: the narrowest platform limit wins (Instagram caption 2200, YouTube title 100). */
export const CAPTION_MAX = 2200;
export const YOUTUBE_TITLE_MAX = 100;
export const PLATFORM_URL_MAX = 500;
export const PLATFORM_NOTE_MAX = 500;
export const FUTURE_SLACK_MS = 300_000;

const NONE: PlatformState = { status: 'none', uploadedAt: null, url: null, versionId: null };

/** Spec L14: the newest event per platform decides; an upload of a version other than the best one is outdated. */
export function summarizePlatforms(latest: Partial<Record<Platform, PlatformLatest>>, bestVersionId: string | null): PlatformSummary {
  const one = (p: Platform): PlatformState => {
    const e = latest[p];
    if (!e || e.action !== 'uploaded') return { ...NONE };
    const status = bestVersionId && e.versionId !== bestVersionId ? 'outdated' : 'uploaded';
    return { status, uploadedAt: e.uploadedAt, url: e.url, versionId: e.versionId };
  };
  return { youtube: one('youtube'), instagram: one('instagram'), tiktok: one('tiktok') };
}

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u' };

/** Spec L19: a download-safe name (`?download=` accepts ^[a-z0-9][a-z0-9-]{0,79}\.mp4$). */
export function fileSlug(name: string): string {
  const ascii = [...name].map((ch) => TR[ch] ?? ch).join('').toLowerCase();
  const s = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'video';
}

/** Spec L12: the caption's first sentence, hashtags and emoji removed, at most 100 characters cut at a word boundary. */
export function youtubeTitleFrom(caption: string): string | null {
  const clean = caption.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const m = clean.match(/^.*?[.!?](?=\s|$)/);
  let t = (m ? m[0] : clean).trim();
  if (t.length > YOUTUBE_TITLE_MAX) {
    const cut = t.slice(0, YOUTUBE_TITLE_MAX + 1);
    t = cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : YOUTUBE_TITLE_MAX).trimEnd();
  }
  return t || null;
}
```

- [ ] **Step 4: Run the shared test**

Run: `npx vitest run packages/shared/test/platforms.test.ts`
Expected: PASS.

- [ ] **Step 5: Schema + migration**

In `packages/db/src/schema.ts`: delete the `publications` table; add to `videos`:
```ts
    /** Video library L12: 'pipeline' | 'import'; the approach ('yaklasim' or null); the caption and YouTube title the user copies. */
    origin: text('origin').notNull().default('pipeline'),
    approach: text('approach'),
    caption: text('caption'),
    youtubeTitle: text('youtube_title'),
```
and the new table:
```ts
/** Video library L13: the append-only upload log (one row per mark or undo); the state is derived (L14). */
export const platformUploads = pgTable(
  'platform_uploads',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    videoId: uuid('video_id').notNull().references(() => videos.id),
    versionId: uuid('version_id').notNull().references(() => versions.id),
    platform: text('platform').notNull(),
    action: text('action').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull(),
    url: text('url'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [index('platform_uploads_video_idx').on(t.videoId, t.platform, t.id)],
);
```
Run: `cd packages/db && npx drizzle-kit generate --name video_library` → `drizzle/0013_video_library.sql` + snapshot + journal. Then edit the SQL: put this block FIRST (before the generated `DROP TABLE "publications"`):
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM publications) THEN RAISE EXCEPTION 'publications has rows; refusing to drop (video library L25)'; END IF;
END $$;--> statement-breakpoint
```
and append:
```sql
--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_origin_ck" CHECK (origin IN ('pipeline','import'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_approach_ck" CHECK (approach IS NULL OR approach IN ('yaklasim'));--> statement-breakpoint
ALTER TABLE "platform_uploads" ADD CONSTRAINT "platform_uploads_platform_ck" CHECK (platform IN ('youtube','instagram','tiktok'));--> statement-breakpoint
ALTER TABLE "platform_uploads" ADD CONSTRAINT "platform_uploads_action_ck" CHECK (action IN ('uploaded','retracted'));--> statement-breakpoint
GRANT SELECT, INSERT ON platform_uploads TO videogen_app;--> statement-breakpoint
GRANT USAGE ON SEQUENCE platform_uploads_id_seq TO videogen_app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON platform_uploads FROM videogen_app;--> statement-breakpoint
UPDATE videos SET status = 'ready' WHERE status = 'published';
```
(Check `0009_publish.sql`/`0000_init.sql` for how grants to `videogen_app` are done — default privileges may already grant; keep the REVOKE regardless.)

- [ ] **Step 6: Code that read `publications` / `published`**

- `packages/db/src/gc.ts:31`: remove `['publications', 'blob_sha'],`.
- `packages/db/src/versions.ts`: remove the `EXISTS (... publications ...) AS published` line and `published:` in the mapper; remove `published` from `VersionView` in shared.
- `packages/db/src/pipeline.ts` `updateVideo`: `SET status = coalesce($2, status), ...` (no `published` CASE).
- `VideoStatus`: remove `'published'`; fix every compile error (`VIDEO_STATUS_EN`, `videoTone`, ReviewPanel, ProductionPanel, production-view, `createAudioEditRun`'s status check and its message `'yalnızca yayına hazır bir videonun sesi düzenlenebilir'` + the API map key).
- `VIDEO_SQL`: add a CTE and columns:
```sql
  pu AS (
    SELECT DISTINCT ON (video_id, platform) video_id, platform, action, version_id, uploaded_at, url
    FROM platform_uploads ORDER BY video_id, platform, id DESC),
```
(as the first CTE, before `u`), and in the select list `pl.platforms`, with
```sql
  LEFT JOIN LATERAL (SELECT jsonb_object_agg(pu.platform, jsonb_build_object('action', pu.action, 'versionId', pu.version_id,
    'uploadedAt', to_char(pu.uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'url', pu.url)) AS platforms
    FROM pu WHERE pu.video_id = v.id) pl ON true
```
- `toVideo`: add `origin: r.origin, approach: r.approach ?? null, caption: r.caption ?? null, youtubeTitle: r.youtube_title ?? null, platforms: summarizePlatforms(r.platforms ?? {}, r.best_version_id ?? null)`.

- [ ] **Step 7: Migration/DB test** (`packages/db/test/video-library-migration.test.ts`)

```ts
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, getVideoView, unwiredShaColumns, updateVideo } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const plan = [{ key: 'research' as const, weight: 100 }];

describe('migration 0013 (spec L13, L25)', () => {
  it('publications is gone, GC has no unwired sha column, and a new video defaults to origin pipeline with all platforms none', async () => {
    expect((await t.pool.query("SELECT to_regclass('public.publications') AS r")).rows[0].r).toBeNull();
    expect(await unwiredShaColumns(t.pool)).toEqual([]);
    const r = await createProduceRun(t.pool, { productName: 'Göç kalemi', audioMode: 'silent', plan });
    const v = (await getVideoView(t.pool, r.videoId))!;
    expect(v).toMatchObject({ origin: 'pipeline', approach: null, caption: null, youtubeTitle: null });
    expect(Object.values(v.platforms).map((p) => p.status)).toEqual(['none', 'none', 'none']);
  });

  it('platform_uploads is append-only for the app role and checks platform/action', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Ek kalem', audioMode: 'silent', plan });
    await t.pool.query("INSERT INTO platform_uploads (video_id, version_id, platform, action, uploaded_at) VALUES ($1, $2, 'youtube', 'uploaded', now())", [r.videoId, r.versionId]);
    await expect(t.pool.query('UPDATE platform_uploads SET note = $1', ['x'])).rejects.toThrow(/permission denied/);
    await expect(t.pool.query('DELETE FROM platform_uploads')).rejects.toThrow(/permission denied/);
    await expect(t.pool.query('TRUNCATE platform_uploads')).rejects.toThrow(/permission denied/);
    await expect(t.pool.query("INSERT INTO platform_uploads (video_id, version_id, platform, action, uploaded_at) VALUES ($1, $2, 'vimeo', 'uploaded', now())", [r.videoId, r.versionId])).rejects.toThrow(/platform_uploads_platform_ck/);
  });

  it('updateVideo sets any status (no published guard any more)', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Durum kalemi', audioMode: 'silent', plan });
    await updateVideo(t.pool, r.videoId, { status: 'ready' });
    expect((await getVideoView(t.pool, r.videoId))!.status).toBe('ready');
  });
});
```
`t.pool` must be the app-role pool (check `createTestDb` returns `pool` on `appUrl`; if it is the admin pool, open `new pg.Pool({ connectionString: t.appUrl })` for the permission assertions). For the "refuses when publications has rows" case: in the same file, build a database from migrations 0000–0012 only (copy the folder to a temp dir without 0013 and trim `_journal.json`), insert one `publications` row via admin, then run `runMigrations` with the full folder and expect it to reject with `/publications has rows/`. Use `runMigrations(adminUrl, folder)` from `../src/migrate.ts` and `withDb` from helpers; drop the database at the end.

- [ ] **Step 8: Run tests**

Run: `npm run typecheck && npx vitest run packages/shared packages/db apps/web/test/i18n.test.ts`
Expected: PASS (fix the `versions` API test that inserted `publications` rows by deleting that insert and the `published` expectations).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(db): migration 0013 — publications dropped (guarded), video origin/approach/caption/youtube title, append-only platform_uploads; platform rules in shared; GC and statuses follow (spec L12–L14, L25)"
```

---

### Task 3: Platform events and text edits in the DB layer

**Files:**
- Create: `packages/db/src/platforms.ts`, `packages/db/test/platforms.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `summarizePlatforms`, limits, types from Task 2; `appendAudit`, `publishEvent`, `getVideoView`.
- Produces:
```ts
export type PlatformEventError = 'video_not_found' | 'no_final' | 'not_uploaded';
export async function recordPlatformEvent(pool: pg.Pool, inp: { videoId: string; platform: Platform; action: PlatformAction; uploadedAt?: Date; url?: string | null; note?: string | null }): Promise<{ event: PlatformEvent; video: VideoView } | { error: PlatformEventError }>;
export async function listPlatformEvents(db: Queryable, videoId: string): Promise<PlatformEvent[]>; // newest first
export async function setVideoText(pool: pg.Pool, videoId: string, p: { caption?: string | null; youtubeTitle?: string | null }): Promise<VideoView | null>;
```
Input validation (lengths, https, future) is the API's job (Task 5); the DB layer trusts its caller but normalises empty strings to `null`.

- [ ] **Step 1: Write the failing test** (`packages/db/test/platforms.test.ts`)

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, insertArtifact, insertBlob, insertVersion, listPlatformEvents, recordPlatformEvent, setBestVersion, setVideoText, verifyAudit } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const plan = [{ key: 'research' as const, weight: 100 }];

async function finished(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  const sha = randomUUID().replace(/-/g, '').padEnd(64, '0');
  await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
  await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'final_video_music', blobSha: sha, inputHash: 'h', durationMs: 12_500 });
  await setBestVersion(t.pool, r.videoId, r.versionId);
  return r;
}
const audits = async (videoId: string) => (await t.pool.query("SELECT action, data FROM audit_log WHERE subject_id = $1 AND action LIKE 'platform.%' ORDER BY seq", [videoId])).rows;
const events = async () => Number((await t.pool.query("SELECT count(*) FROM ui_events WHERE type = 'video.updated'")).rows[0].count);

describe('platform events (spec L13–L17)', () => {
  it('mark → state uploaded on the best version, audited, video.updated published in the same write; undo → none; re-upload adds a row', async () => {
    const r = await finished('Platform kalemi');
    const before = await events();
    const a = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'uploaded', url: 'https://www.instagram.com/reel/abc/', note: 'ilk' });
    if ('error' in a) throw new Error(a.error);
    expect(a.event).toMatchObject({ platform: 'instagram', action: 'uploaded', versionId: r.versionId, url: 'https://www.instagram.com/reel/abc/', note: 'ilk' });
    expect(a.video.platforms.instagram.status).toBe('uploaded');
    expect(a.video.platforms.youtube.status).toBe('none');
    expect(await events()).toBe(before + 1);
    const b = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'retracted' });
    if ('error' in b) throw new Error(b.error);
    expect(b.event.versionId).toBe(r.versionId);
    expect(b.video.platforms.instagram.status).toBe('none');
    await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'uploaded' });
    await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'uploaded' });
    const list = await listPlatformEvents(t.pool, r.videoId);
    expect(list.map((e) => e.action)).toEqual(['uploaded', 'uploaded', 'retracted', 'uploaded']);
    expect((await audits(r.videoId)).map((x) => x.action)).toEqual(['platform.uploaded', 'platform.retracted', 'platform.uploaded', 'platform.uploaded']);
    expect((await audits(r.videoId))[0].data).toMatchObject({ platform: 'instagram', versionId: r.versionId, hasUrl: true });
    expect((await verifyAudit(t.pool)).ok).toBe(true);
  });

  it('errors: unknown video, no final on the best version, undo with nothing uploaded', async () => {
    expect(await recordPlatformEvent(t.pool, { videoId: randomUUID(), platform: 'youtube', action: 'uploaded' })).toEqual({ error: 'video_not_found' });
    const bare = await createProduceRun(t.pool, { productName: 'Finalsiz kalem', audioMode: 'silent', plan });
    expect(await recordPlatformEvent(t.pool, { videoId: bare.videoId, platform: 'youtube', action: 'uploaded' })).toEqual({ error: 'no_final' });
    const r = await finished('Geri alma kalemi');
    expect(await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'tiktok', action: 'retracted' })).toEqual({ error: 'not_uploaded' });
  });

  it('a new best version makes an earlier upload outdated, and undo still works on it', async () => {
    const r = await finished('Sürüm kalemi');
    await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'youtube', action: 'uploaded' });
    const v1 = randomUUID();
    await insertVersion(t.pool, { id: v1, videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'fix:compose' });
    const sha = 'e'.repeat(64);
    await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
    await insertArtifact(t.pool, { runId: r.runId, versionId: v1, kind: 'final_video_music', blobSha: sha, inputHash: 'h1' });
    await setBestVersion(t.pool, r.videoId, v1);
    const x = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'youtube', action: 'retracted' });
    if ('error' in x) throw new Error(x.error);
    expect(x.event.versionId).toBe(r.versionId);
  });

  it('uploadedAt is stored as given (a past date is fine)', async () => {
    const r = await finished('Tarih kalemi');
    const at = new Date('2026-10-01T08:30:00.000Z');
    const a = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'tiktok', action: 'uploaded', uploadedAt: at });
    if ('error' in a) throw new Error(a.error);
    expect(a.event.uploadedAt).toBe('2026-10-01T08:30:00.000Z');
  });

  it('setVideoText stores caption and title, empty → null, audits field and length, publishes video.updated; unknown video → null', async () => {
    const r = await finished('Metin kalemi');
    const v = await setVideoText(t.pool, r.videoId, { caption: 'Two sentences. One question?', youtubeTitle: '' });
    expect(v).toMatchObject({ caption: 'Two sentences. One question?', youtubeTitle: null });
    const rows = (await t.pool.query("SELECT data FROM audit_log WHERE subject_id = $1 AND action = 'video.text_edited' ORDER BY seq", [r.videoId])).rows;
    expect(rows.map((x) => x.data.field).sort()).toEqual(['caption', 'youtubeTitle']);
    expect(rows.find((x) => x.data.field === 'caption').data).toMatchObject({ length: 28, preview: 'Two sentences. One question?' });
    expect(await setVideoText(t.pool, randomUUID(), { caption: 'x' })).toBeNull();
  });
});
```
(Check the exact names of `insertBlob`, `setBestVersion`, `verifyAudit` and its result shape in `packages/db/src/index.ts`/`audit.ts`; the api `versions.test.ts` already imports the first four.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run packages/db/test/platforms.test.ts`
Expected: FAIL (`recordPlatformEvent` is not exported).

- [ ] **Step 3: Implement `packages/db/src/platforms.ts`** and `export * from './platforms.ts';` in `index.ts`

```ts
import type pg from 'pg';
import type { Platform, PlatformAction, PlatformEvent, VideoView } from '@videogen/shared';
import { appendAudit } from './audit.ts';
import type { Queryable } from './client.ts';
import { publishEvent } from './events.ts';
import { getVideoView } from './pipeline.ts';

export type PlatformEventError = 'video_not_found' | 'no_final' | 'not_uploaded';

const toEvent = (r: Record<string, any>): PlatformEvent => ({
  id: Number(r.id), platform: r.platform, action: r.action, versionId: r.version_id, uploadedAt: new Date(r.uploaded_at).toISOString(),
  url: r.url ?? null, note: r.note ?? null, createdAt: new Date(r.created_at).toISOString(),
});
const blank = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

/**
 * Video library L13–L17: one mark or undo — the row, its audit entry and `video.updated` in one transaction; the video row is locked so
 * two devices marking at once are ordered. An upload points at the best version; an undo at the upload it undoes.
 */
export async function recordPlatformEvent(
  pool: pg.Pool,
  inp: { videoId: string; platform: Platform; action: PlatformAction; uploadedAt?: Date; url?: string | null; note?: string | null },
): Promise<{ event: PlatformEvent; video: VideoView } | { error: PlatformEventError }> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const v = (await c.query('SELECT id, best_version_id FROM videos WHERE id = $1 FOR UPDATE', [inp.videoId])).rows[0];
    if (!v) { await c.query('ROLLBACK'); return { error: 'video_not_found' }; }
    let versionId: string;
    if (inp.action === 'uploaded') {
      const f = v.best_version_id
        ? (await c.query("SELECT 1 FROM artifacts WHERE version_id = $1 AND kind = 'final_video_music' LIMIT 1", [v.best_version_id])).rowCount
        : 0;
      if (!f) { await c.query('ROLLBACK'); return { error: 'no_final' }; }
      versionId = v.best_version_id;
    } else {
      const last = (await c.query('SELECT action, version_id FROM platform_uploads WHERE video_id = $1 AND platform = $2 ORDER BY id DESC LIMIT 1', [inp.videoId, inp.platform])).rows[0];
      if (!last || last.action !== 'uploaded') { await c.query('ROLLBACK'); return { error: 'not_uploaded' }; }
      versionId = last.version_id;
    }
    const url = blank(inp.url);
    const note = blank(inp.note);
    const row = (await c.query(
      `INSERT INTO platform_uploads (video_id, version_id, platform, action, uploaded_at, url, note)
       VALUES ($1, $2, $3, $4, coalesce($5, now()), $6, $7) RETURNING *`,
      [inp.videoId, versionId, inp.platform, inp.action, inp.uploadedAt ?? null, url, note],
    )).rows[0];
    const event = toEvent(row);
    await appendAudit(c, {
      actorType: 'user', action: `platform.${inp.action}`, subjectType: 'video', subjectId: inp.videoId,
      data: { platform: inp.platform, versionId, hasUrl: url !== null, uploadedAt: event.uploadedAt },
    });
    await c.query('UPDATE videos SET updated_at = now() WHERE id = $1', [inp.videoId]);
    const video = (await getVideoView(c, inp.videoId))!;
    await publishEvent(c, { topic: 'videos', type: 'video.updated', payload: video });
    await c.query('COMMIT');
    return { event, video };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function listPlatformEvents(db: Queryable, videoId: string): Promise<PlatformEvent[]> {
  const { rows } = await db.query('SELECT * FROM platform_uploads WHERE video_id = $1 ORDER BY id DESC', [videoId]);
  return rows.map(toEvent);
}

/** Video library L12/L17: the caption and YouTube title the user copies; each changed field is audited. */
export async function setVideoText(pool: pg.Pool, videoId: string, p: { caption?: string | null; youtubeTitle?: string | null }): Promise<VideoView | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const cur = (await c.query('SELECT id FROM videos WHERE id = $1 FOR UPDATE', [videoId])).rows[0];
    if (!cur) { await c.query('ROLLBACK'); return null; }
    const fields: [string, string, string | null | undefined][] = [['caption', 'caption', p.caption], ['youtubeTitle', 'youtube_title', p.youtubeTitle]];
    for (const [field, col, value] of fields) {
      if (value === undefined) continue;
      const v = blank(value);
      await c.query(`UPDATE videos SET ${col} = $2, updated_at = now() WHERE id = $1`, [videoId, v]);
      await appendAudit(c, { actorType: 'user', action: 'video.text_edited', subjectType: 'video', subjectId: videoId, data: { field, length: v?.length ?? 0, preview: v?.slice(0, 120) ?? null } });
    }
    const video = (await getVideoView(c, videoId))!;
    await publishEvent(c, { topic: 'videos', type: 'video.updated', payload: video });
    await c.query('COMMIT');
    return video;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
```
`blank` trims; spec says empty → null; non-empty values are stored trimmed.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/db/test/platforms.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): platform upload events and caption/title edits — one transaction with audit and video.updated (spec L13–L17)"
```

---

### Task 4: Episode import core and read-only imported videos

**Files:**
- Create: `packages/shared/src/episodes.ts`, `packages/db/src/episodes.ts`, `packages/db/test/episodes.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/pipeline.ts` (`RunKind`), `packages/db/src/index.ts`, `packages/db/src/pipeline.ts` (`createAudioEditRun`), `apps/api/src/routes/videos.ts` (`AUDIO_EDIT_ERRORS`)

**Interfaces:**
- Produces (shared):
```ts
export const EpisodeEntrySchema: z.ZodObject<...>; // slug, product, title, language ('en'|'tr'), audioMode ('silent'|'vo'), approach ('yaklasim'|null), sha256 (64 hex), recordedAt (ISO)
export const EpisodeManifestSchema: z.ZodObject<{ episodes: z.ZodArray<typeof EpisodeEntrySchema> }>;
export type EpisodeEntry = z.infer<typeof EpisodeEntrySchema>;
```
- Produces (db):
```ts
export interface EpisodeMedia { file: string; cover: string; durationMs: number; width: number; height: number; codec: string; caption: string | null }
export type ImportOutcome = { kind: 'imported'; videoId: string; versionId: string } | { kind: 'exists'; videoId: string } | { kind: 'sha_mismatch'; actual: string };
export async function importEpisode(pool: pg.Pool, dataDir: string, entry: EpisodeEntry, media: EpisodeMedia): Promise<ImportOutcome>;
```

- [ ] **Step 1: Write the failing test** (`packages/db/test/episodes.test.ts`)

```ts
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAudioEditRun, getVideoView, importEpisode, listVersions } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
const dir = mkdtempSync(join(tmpdir(), 'vg-episodes-'));
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

function media(name: string, body: string) {
  const file = join(dir, `${name}.mp4`);
  const cover = join(dir, `${name}.png`);
  writeFileSync(file, body);
  writeFileSync(cover, `png-${body}`);
  return { file, cover, sha: createHash('sha256').update(body).digest('hex') };
}
const entry = (slug: string, sha256: string, product = 'Rubik küpü') =>
  ({ slug, product, title: `${product} — what's inside`, language: 'en' as const, audioMode: 'silent' as const, approach: 'yaklasim' as const, sha256, recordedAt: '2026-10-11T01:58:00.000Z' });
const facts = (m: { file: string; cover: string }) => ({ ...m, durationMs: 12_600, width: 1080, height: 1920, codec: 'h264', caption: "How a Rubik's cube holds itself together. No glue.\n\n#rubikscube" });

describe('importEpisode (spec L9–L11)', () => {
  it('creates product, video, done import run, version, final + cover with one input hash; the library and versions see it; audited; second run is a no-op', async () => {
    const m = media('rubik', 'rubik-bytes');
    const out = await importEpisode(t.pool, dir, entry('rubik', m.sha), facts(m));
    if (out.kind !== 'imported') throw new Error(out.kind);
    const v = (await getVideoView(t.pool, out.videoId))!;
    expect(v).toMatchObject({ origin: 'import', approach: 'yaklasim', status: 'ready', productName: 'Rubik küpü', youtubeTitle: "How a Rubik's cube holds itself together." });
    expect(v.caption).toContain('#rubikscube');
    expect(v.final).toMatchObject({ durationS: 12.6 });
    expect(v.createdAt).toBe('2026-10-11T01:58:00.000Z');
    const vs = await listVersions(t.pool, out.videoId);
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ reason: 'import', best: true, current: true });
    expect(vs[0].finals?.musicSha).toBe(m.sha);
    expect(vs[0].finals?.coverSha).toMatch(/^[0-9a-f]{64}$/);
    const run = (await t.pool.query('SELECT kind, trigger, status FROM runs WHERE video_id = $1', [out.videoId])).rows[0];
    expect(run).toEqual({ kind: 'import', trigger: 'cli', status: 'done' });
    expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'video.imported' AND subject_id = $1", [out.videoId])).rows[0].data).toMatchObject({ slug: 'rubik', sha: m.sha });
    expect(await importEpisode(t.pool, dir, entry('rubik', m.sha), facts(m))).toEqual({ kind: 'exists', videoId: out.videoId });
  });

  it('a file whose sha differs from the manifest is refused and writes nothing', async () => {
    const m = media('bad', 'bad-bytes');
    const before = Number((await t.pool.query('SELECT count(*) FROM videos')).rows[0].count);
    expect(await importEpisode(t.pool, dir, entry('bad', 'f'.repeat(64), 'Kötü'), facts(m))).toEqual({ kind: 'sha_mismatch', actual: m.sha });
    expect(Number((await t.pool.query('SELECT count(*) FROM videos')).rows[0].count)).toBe(before);
  });

  it('two episodes of one product share the product row', async () => {
    const a = media('kalem-a', 'a-bytes');
    const b = media('kalem-b', 'b-bytes');
    const x = await importEpisode(t.pool, dir, entry('kalem-a', a.sha, 'Kalem'), facts(a));
    const y = await importEpisode(t.pool, dir, entry('kalem-b', b.sha, 'Kalem'), facts(b));
    if (x.kind !== 'imported' || y.kind !== 'imported') throw new Error('not imported');
    expect((await getVideoView(t.pool, x.videoId))!.productId).toBe((await getVideoView(t.pool, y.videoId))!.productId);
  });

  it('an imported video cannot be audio-edited', async () => {
    const m = media('edit', 'edit-bytes');
    const out = await importEpisode(t.pool, dir, entry('edit', m.sha, 'Düzenleme'), facts(m));
    if (out.kind !== 'imported') throw new Error(out.kind);
    expect(await createAudioEditRun(t.pool, { videoId: out.videoId, instruction: 'daha sakin', plan: [] })).toEqual({ error: 'içe aktarılmış bir video düzenlenemez' });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run packages/db/test/episodes.test.ts`
Expected: FAIL (`importEpisode` is not exported).

- [ ] **Step 3: Implement**

`packages/shared/src/episodes.ts`:
```ts
import { z } from 'zod';

/** Video library L8: one copied episode; the files live in <dataDir>/episodes/<slug>/ (final.mp4, caption.txt). */
export const EpisodeEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  product: z.string().min(2).max(80),
  title: z.string().min(2).max(160),
  language: z.enum(['en', 'tr']),
  audioMode: z.enum(['silent', 'vo']),
  approach: z.enum(['yaklasim']).nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  recordedAt: z.iso.datetime(),
});
export const EpisodeManifestSchema = z.object({ episodes: z.array(EpisodeEntrySchema).min(1) });
export type EpisodeEntry = z.infer<typeof EpisodeEntrySchema>;
```
(If the repo's zod version lacks `z.iso`, use `z.string().datetime()`.) Add `'import'` to `RunKind`.

`packages/db/src/episodes.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { normalizeProductName, youtubeTitleFrom, type EpisodeEntry } from '@videogen/shared';
import { appendAudit } from './audit.ts';
import { publishEvent } from './events.ts';
import { putBlob } from './media.ts';
import { getVideoView, insertArtifact } from './pipeline.ts';

export interface EpisodeMedia { file: string; cover: string; durationMs: number; width: number; height: number; codec: string; caption: string | null }
export type ImportOutcome = { kind: 'imported'; videoId: string; versionId: string } | { kind: 'exists'; videoId: string } | { kind: 'sha_mismatch'; actual: string };

/**
 * Video library L9/L10: an episode made outside the pipeline becomes a ready, read-only video with one version whose final and cover
 * have the shape `listVersions`/`VIDEO_SQL` read. Blobs are stored first (idempotent; an orphan is GC's), then the rows in one transaction.
 */
export async function importEpisode(pool: pg.Pool, dataDir: string, entry: EpisodeEntry, media: EpisodeMedia): Promise<ImportOutcome> {
  const existing = (await pool.query(
    `SELECT r.video_id FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE a.kind = 'final_video_music' AND a.blob_sha = $1 LIMIT 1`, [entry.sha256],
  )).rows[0];
  if (existing) return { kind: 'exists', videoId: existing.video_id };
  const video = await putBlob(pool, dataDir, media.file);
  if (video.sha256 !== entry.sha256) return { kind: 'sha_mismatch', actual: video.sha256 };
  const cover = await putBlob(pool, dataDir, media.cover);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query(
      `INSERT INTO products (id, name, normalized_name) VALUES ($1, $2, $3)
       ON CONFLICT (normalized_name) DO UPDATE SET normalized_name = EXCLUDED.normalized_name RETURNING id`,
      [randomUUID(), entry.product, normalizeProductName(entry.product)],
    );
    const videoId = randomUUID();
    const versionId = randomUUID();
    const runId = randomUUID();
    const caption = media.caption?.trim() ? media.caption.trim() : null;
    await c.query(
      `INSERT INTO videos (id, product_id, title, audio_mode, language, status, origin, approach, caption, youtube_title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ready', 'import', $6, $7, $8, $9, $9)`,
      [videoId, p.rows[0].id, entry.title, entry.audioMode, entry.language, entry.approach, caption, caption ? youtubeTitleFrom(caption) : null, entry.recordedAt],
    );
    await c.query(`INSERT INTO versions (id, video_id, round, reason, created_at) VALUES ($1, $2, 0, 'import', $3)`, [versionId, videoId, entry.recordedAt]);
    await c.query(
      `INSERT INTO runs (id, video_id, kind, trigger, plan, status, progress, created_at, started_at, ended_at)
       VALUES ($1, $2, 'import', 'cli', $3, 'done', 1, $4, $4, $4)`,
      [runId, videoId, JSON.stringify({ source: 'episode', slug: entry.slug }), entry.recordedAt],
    );
    await c.query('UPDATE videos SET best_version_id = $2, current_version_id = $2 WHERE id = $1', [videoId, versionId]);
    await insertArtifact(c, { runId, versionId, kind: 'final_video_music', blobSha: video.sha256, inputHash: video.sha256, durationMs: media.durationMs, width: media.width, height: media.height, codec: media.codec });
    await insertArtifact(c, { runId, versionId, kind: 'final_cover', blobSha: cover.sha256, inputHash: video.sha256 });
    await appendAudit(c, {
      actorType: 'user', action: 'video.imported', subjectType: 'video', subjectId: videoId, runId,
      data: { slug: entry.slug, sha: video.sha256, bytes: video.bytes, durationS: Math.round(media.durationMs / 100) / 10 },
    });
    await publishEvent(c, { topic: 'videos', type: 'video.updated', payload: (await getVideoView(c, videoId))! });
    await c.query('COMMIT');
    return { kind: 'imported', videoId, versionId };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
```
Note: `runs.plan` holds `{source, slug}` (spec L9 said `plan=[]`; an object is more useful and the column is jsonb — if any reader maps `plan` as an array of steps, e.g. `toRun`, store `[]` and put `{source, slug}` in the audit only; check `toRun` before choosing). `insertArtifact` takes a `Queryable`; if its signature is pool-only, pass `c` anyway (pg client has `query`).

`createAudioEditRun` (packages/db/src/pipeline.ts ~line 70): after loading the video row, before the status check:
```ts
    if (v.origin === 'import') return { error: 'içe aktarılmış bir video düzenlenemez' };
```
(make sure the SELECT includes `origin`). `apps/api/src/routes/videos.ts` `AUDIO_EDIT_ERRORS`: add `'içe aktarılmış bir video düzenlenemez': 'Imported videos cannot be edited.'`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/db/test/episodes.test.ts packages/db/test/pipeline.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): import an episode as a ready, read-only video — product, import run, version, final and frame-0 cover; idempotent by sha (spec L8–L11)"
```

---

### Task 5: Platform API routes

**Files:**
- Create: `apps/api/src/routes/platforms.ts`, `apps/api/test/platforms.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `recordPlatformEvent`, `listPlatformEvents`, `setVideoText`, `getVideoView` (db); `PLATFORMS`, `PLATFORM_ACTIONS`, limits (shared).
- Produces HTTP:
  - `GET /api/videos/:id/platforms` → `200 { state: PlatformSummary, events: PlatformEvent[] }` | 404
  - `POST /api/videos/:id/platforms` body `{ platform, action, uploadedAt?, url?, note? }` → `201 { event, video }` | 400 | 404 | 409 `{ error }`
  - `PATCH /api/videos/:id/text` body `{ caption?, youtubeTitle? }` → `200 VideoView` | 400 | 404

- [ ] **Step 1: Write the failing test** (`apps/api/test/platforms.test.ts`)

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { createProduceRun, insertArtifact, insertBlob, setBestVersion } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
const H = { host: '127.0.0.1:5180' };
beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', devEndpoints: false } });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); });

const plan = [{ key: 'research' as const, weight: 100 }];
async function finished(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  const sha = randomUUID().replace(/-/g, '').padEnd(64, 'a');
  await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
  await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'final_video_music', blobSha: sha, inputHash: 'h' });
  await setBestVersion(t.pool, r.videoId, r.versionId);
  return r;
}
const post = (id: string, payload: unknown) => app.inject({ method: 'POST', url: `/api/videos/${id}/platforms`, headers: H, payload });

describe('platform routes (spec L12, L15, L16, L18)', () => {
  it('mark, read, undo; the list summary carries the state', async () => {
    const r = await finished('Rota kalemi');
    const a = await post(r.videoId, { platform: 'youtube', action: 'uploaded', url: 'https://youtube.com/shorts/x1', note: 'first' });
    expect(a.statusCode).toBe(201);
    expect(a.json().video.platforms.youtube.status).toBe('uploaded');
    const g = await app.inject({ url: `/api/videos/${r.videoId}/platforms`, headers: H });
    expect(g.json().state.youtube.url).toBe('https://youtube.com/shorts/x1');
    expect(g.json().events).toHaveLength(1);
    const list = await app.inject({ url: '/api/videos', headers: H });
    expect(list.json().find((v: { id: string }) => v.id === r.videoId).platforms.youtube.status).toBe('uploaded');
    expect((await post(r.videoId, { platform: 'youtube', action: 'retracted' })).statusCode).toBe(201);
  });

  it('400s: unknown platform/action, http url, long note, uploadedAt 10 min ahead; a past uploadedAt is fine', async () => {
    const r = await finished('Doğrulama kalemi');
    expect((await post(r.videoId, { platform: 'vimeo', action: 'uploaded' })).statusCode).toBe(400);
    expect((await post(r.videoId, { platform: 'youtube', action: 'deleted' })).statusCode).toBe(400);
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded', url: 'http://youtube.com/x' })).statusCode).toBe(400);
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded', note: 'n'.repeat(501) })).statusCode).toBe(400);
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded', uploadedAt: new Date(Date.now() + 600_000).toISOString() })).statusCode).toBe(400);
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded', uploadedAt: '2026-10-01T08:00:00.000Z', url: '' })).statusCode).toBe(201);
  });

  it('404 unknown video, 409 no final and undo with nothing uploaded', async () => {
    expect((await post(randomUUID(), { platform: 'youtube', action: 'uploaded' })).statusCode).toBe(404);
    expect((await post('not-a-uuid', { platform: 'youtube', action: 'uploaded' })).statusCode).toBe(404);
    const bare = await createProduceRun(t.pool, { productName: 'Finalsiz', audioMode: 'silent', plan });
    const n = await post(bare.videoId, { platform: 'youtube', action: 'uploaded' });
    expect(n.statusCode).toBe(409);
    expect(n.json().error).toBe('This video has no downloadable final yet.');
    const r = await finished('Geri al');
    const u = await post(r.videoId, { platform: 'tiktok', action: 'retracted' });
    expect(u.statusCode).toBe(409);
    expect(u.json().error).toBe('Nothing to undo: it is not marked as uploaded on TikTok.');
  });

  it('PATCH text: limits, empty → null, unknown → 404', async () => {
    const r = await finished('Metin');
    const ok = await app.inject({ method: 'PATCH', url: `/api/videos/${r.videoId}/text`, headers: H, payload: { caption: 'Hi. Why?', youtubeTitle: '' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ caption: 'Hi. Why?', youtubeTitle: null });
    expect((await app.inject({ method: 'PATCH', url: `/api/videos/${r.videoId}/text`, headers: H, payload: { caption: 'c'.repeat(2201) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/videos/${r.videoId}/text`, headers: H, payload: { youtubeTitle: 't'.repeat(101) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/videos/${r.videoId}/text`, headers: H, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/videos/${randomUUID()}/text`, headers: H, payload: { caption: 'x' } })).statusCode).toBe(404);
  });

  it('the removed publish endpoints are gone', async () => {
    for (const [method, url] of [['GET', '/api/tiktok'], ['POST', `/api/videos/${randomUUID()}/publish`], ['POST', `/api/videos/${randomUUID()}/exports/shorts`]] as const) {
      expect((await app.inject({ method, url, headers: H, payload: {} })).statusCode).toBe(404);
    }
  });
});
```
Also add to `apps/api/test/guard.test.ts` one case: a `POST /api/videos/<id>/platforms` and a `PATCH /api/videos/<id>/text` from a foreign `origin` header are refused with the same status the guard uses for other writes (read the existing cases in that file and copy their shape; the guard must treat PATCH as a write — if it only checks POST/PUT/DELETE, add PATCH to it).

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run apps/api/test/platforms.test.ts`
Expected: FAIL (404 for the new routes).

- [ ] **Step 3: Implement `apps/api/src/routes/platforms.ts`** and register it in `app.ts` after `registerVideoRoutes`

```ts
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { CAPTION_MAX, FUTURE_SLACK_MS, PLATFORM_ACTIONS, PLATFORM_NOTE_MAX, PLATFORM_URL_MAX, PLATFORMS, YOUTUBE_TITLE_MAX, type Platform } from '@videogen/shared';
import { getVideoView, isUuid, listPlatformEvents, recordPlatformEvent, setVideoText } from '@videogen/db';

const NAME: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };

const Mark = z.object({
  platform: z.enum(PLATFORMS, { error: 'the platform must be youtube, instagram or tiktok' }),
  action: z.enum(PLATFORM_ACTIONS, { error: 'the action must be uploaded or retracted' }),
  uploadedAt: z.string().datetime({ offset: true, error: 'uploadedAt must be an ISO date' })
    .refine((s) => Date.parse(s) <= Date.now() + FUTURE_SLACK_MS, 'the upload time cannot be in the future').optional(),
  url: z.string().trim().max(PLATFORM_URL_MAX, `the link can be at most ${PLATFORM_URL_MAX} characters`)
    .refine((s) => s === '' || /^https:\/\/\S+$/.test(s), 'the link must start with https://').optional(),
  note: z.string().max(PLATFORM_NOTE_MAX, `the note can be at most ${PLATFORM_NOTE_MAX} characters`).optional(),
});
const Text = z.object({
  caption: z.string().max(CAPTION_MAX, `the caption can be at most ${CAPTION_MAX} characters`).nullable().optional(),
  youtubeTitle: z.string().max(YOUTUBE_TITLE_MAX, `the YouTube title can be at most ${YOUTUBE_TITLE_MAX} characters`).nullable().optional(),
}).refine((b) => b.caption !== undefined || b.youtubeTitle !== undefined, 'nothing to change');

/** Video library L18: the manual upload log (phone and desktop) and the texts the user copies into the platform apps. */
export function registerPlatformRoutes(app: FastifyInstance, deps: { pool: pg.Pool }): void {
  const { pool } = deps;
  const id = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get('/api/videos/:id/platforms', async (req, reply) => {
    const v = isUuid(id(req)) ? await getVideoView(pool, id(req)) : null;
    if (!v) return reply.code(404).send({ error: 'not found' });
    return { state: v.platforms, events: await listPlatformEvents(pool, v.id) };
  });

  app.post('/api/videos/:id/platforms', async (req, reply) => {
    if (!isUuid(id(req))) return reply.code(404).send({ error: 'not found' });
    const b = Mark.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'invalid request' });
    const out = await recordPlatformEvent(pool, {
      videoId: id(req), platform: b.data.platform, action: b.data.action,
      ...(b.data.uploadedAt ? { uploadedAt: new Date(b.data.uploadedAt) } : {}), url: b.data.url ?? null, note: b.data.note ?? null,
    });
    if ('error' in out) {
      if (out.error === 'video_not_found') return reply.code(404).send({ error: 'not found' });
      if (out.error === 'no_final') return reply.code(409).send({ error: 'This video has no downloadable final yet.' });
      return reply.code(409).send({ error: `Nothing to undo: it is not marked as uploaded on ${NAME[b.data.platform]}.` });
    }
    return reply.code(201).send(out);
  });

  app.patch('/api/videos/:id/text', async (req, reply) => {
    if (!isUuid(id(req))) return reply.code(404).send({ error: 'not found' });
    const b = Text.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'invalid request' });
    const v = await setVideoText(pool, id(req), b.data);
    return v ?? reply.code(404).send({ error: 'not found' });
  });
}
```
(Match the zod 4 error-option style already used in `routes/videos.ts`; if `.datetime({ offset })` is spelled differently in the installed zod, use `z.iso.datetime({ offset: true })`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/test/platforms.test.ts apps/api/test/guard.test.ts apps/api/test/videos.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): platform upload log and caption/title routes with validation; tailnet guard covers PATCH (spec L15, L16, L18)"
```

---

### Task 6: Bring the episodes into VideoGen (sources, data, tools, CLI, path hygiene)

**Files:**
- Create: `episodes/<slug>/...` (9 folders), `episodes/README.md`, `episodes/manifest.json`, `docs/approach/YAKLASIM.md`, `docs/approach/prompt-{asma-kilit,hikaye,kulaklik,yeni-urun}.md`, `bin/contact-sheet`, `bin/sheet`, `bin/import-episodes.mjs`, `packages/shared/test/repo-hygiene.test.ts`, `apps/worker/test/import-episodes-cli.test.ts`
- Modify: `apps/worker/src/real/steps.ts:86`, `docs/machine-checklist.md`, `Blender-3D-Cutaway-Kilavuzu.md`
- Outside the repo (one-time, not committed): `~/videogen-data/episodes/<slug>/{final.mp4,caption.txt,assets/*.glb}`, `~/.local/bin/blender-gpu` symlink

**Interfaces:**
- Consumes: `EpisodeManifestSchema` (shared), `importEpisode`, `createPool`, `fileSha256` (db), `loadConfig`.
- Produces: CLI `node bin/import-episodes.mjs [--dry-run] [--manifest <path>] [--data-dir <dir>]`, exit 0 when every episode is imported or exists, 1 otherwise. Prints one line per episode: `<slug>: imported|exists|missing|sha mismatch|warning ...`.

- [ ] **Step 1: One-time copy (scratch script, not committed)**

Write `$SCRATCH/copy-episodes.sh` (SCRATCH = the session scratchpad) that takes the source root as `$1` and, for each slug in `asma-kilit cpu enigma klavye kulaklik pilot-kalem ps5-kol rubik saat`:
```bash
SRC="$1"; REPO=/home/alper/gpu-server/VideoGen-library; DATA="${VG_DATA_DIR:-$HOME/videogen-data}/episodes"
for s in asma-kilit cpu enigma klavye kulaklik pilot-kalem ps5-kol rubik saat; do
  rsync -a --prune-empty-dirs \
    --exclude node_modules --exclude 'remotion/public/frames' --exclude 'out/' --exclude __pycache__ --exclude .venv \
    --exclude 'tts/clips' --exclude 'tts/chosen' \
    --include '*/' --include '*.py' --include '*.ts' --include '*.tsx' --include '*.json' --include '*.md' --include '*.txt' --include '*.sh' \
    --include 'remotion.config.*' --exclude '*' "$SRC/$s/" "$REPO/episodes/$s/"
  mkdir -p "$DATA/$s/assets"
  final=$(ls "$SRC/$s"/remotion/out/*.mp4 | grep -v -e raw -e onizleme -e draft | head -1)
  cp -p "$final" "$DATA/$s/final.mp4"
  [ -f "$SRC/$s/caption.txt" ] && cp -p "$SRC/$s/caption.txt" "$DATA/$s/caption.txt"
  [ -d "$SRC/$s/blender/asset_dl" ] && cp -p "$SRC/$s"/blender/asset_dl/*.glb "$DATA/$s/assets/" 2>/dev/null || true
done
cp -p "$SRC/YAKLASIM.md" "$SRC"/prompt-*.md "$REPO/docs/approach/"
cp -p "$SRC/bin/contact-sheet" "$SRC/bin/sheet" "$REPO/bin/"
```
Run it with the source root as the argument. Check: `ls ~/videogen-data/episodes/*/final.mp4 | wc -l` → 9; `du -sh episodes` well under 20 MB; `git status --short episodes | grep -E '\.(mp4|png|blend|glb|wav)$'` → empty. pilot-kalem has no `caption.txt` (fine).

- [ ] **Step 2: Path hygiene inside the copies**

Rewrite in `episodes/**` and `docs/approach/**` (sed, then review the diff by eye):
- `~/icinde-ne-var/bin/` → `bin/` (repo-relative; `blender-gpu` is on PATH)
- `~/icinde-ne-var/<slug>` and `cd ~/icinde-ne-var/<slug>` → `episodes/<slug>`
- `icinde-ne-var-<x>.mp4` → `<x>.mp4`; `../tts/run.sh` in `enigma/tts/qa.py` → a comment that the TTS venv is not part of VideoGen
- memory paths `~/.claude/projects/-home-alper/memory/icinde-ne-var-*.md` → `docs/approach/YAKLASIM.md`
- top README heading of the old channel → keep the channel name "İçinde Ne Var" only as prose if it is the channel's name, never as a path.
Then `grep -rn "icinde-ne-var\|icinde_ne_var" episodes docs/approach bin` → empty.

Write `episodes/README.md`:
```markdown
# Episodes (reference sources)

Sources of the nine episodes made by hand before the pipeline adopted the YAKLASIM approach (`docs/approach/YAKLASIM.md`).
Rubik (`episodes/rubik`) is the reference implementation of the approach.

- VideoGen does not build or run this code; it is outside `tsconfig.json` and vitest.
- Rendered finals, captions and the Sketchfab models (`*.glb`, third-party licences, not redistributed) are in
  `~/videogen-data/episodes/<slug>/` (`final.mp4`, `caption.txt`, `assets/`). Frames, `.blend` files and `node_modules` are not kept:
  they are regenerated by the commands in each episode's README.
- The finals are in the Library through `node bin/import-episodes.mjs` (manifest: `episodes/manifest.json`).
```

- [ ] **Step 3: Manifest**

Build `episodes/manifest.json` from the copied data (sha256 via `sha256sum ~/videogen-data/episodes/*/final.mp4`, `recordedAt` via `date -u -r <final> +%Y-%m-%dT%H:%M:%S.000Z` on the *source* file before copy — `cp -p` keeps mtime so the copy works too). Products and titles:

| slug | product | title | language | audioMode | approach |
|---|---|---|---|---|---|
| pilot-kalem | Tükenmez kalem | Tükenmez kalem — what's inside | en | silent | null |
| klavye | Klavye | Klavye — what's inside | en | silent | null |
| cpu | İşlemci (CPU) | İşlemci (CPU) — what's inside | en | silent | null |
| ps5-kol | PS5 kolu | PS5 kolu — what's inside | en | silent | null |
| saat | Kol saati | Kol saati — what's inside | en | silent | null |
| asma-kilit | Asma kilit | Asma kilit — what's inside | en | silent | null |
| kulaklik | Kulaklık | Kulaklık — what's inside | en | silent | null |
| enigma | Enigma makinesi | Enigma makinesi — what's inside | tr | vo | null |
| rubik | Rubik küpü | Rubik küpü — what's inside | en | silent | yaklasim |

(Read each episode's README heading/caption to confirm the product; adjust names if a README says otherwise. Language: check that the on-screen text of each episode is English — the README/PLAN says so for the post-2026-10-07 ones; pilot-kalem and enigma: read their remotion src for on-screen strings.)

- [ ] **Step 4: Repo hygiene test** (`packages/shared/test/repo-hygiene.test.ts`)

```ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EpisodeManifestSchema } from '../src/index.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const ALLOWED = [/^docs\/superpowers\//, /^docs\/m5\//];

describe('the old episode folder is not referenced (spec L3, L4)', () => {
  it('no tracked file outside the historical docs mentions it', () => {
    const files = execFileSync('git', ['grep', '-l', '-I', 'icinde-ne-var'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(files.filter((f) => !ALLOWED.some((re) => re.test(f)))).toEqual([]);
  });

  it('episodes/ is outside typecheck and unit tests', () => {
    const ts = JSON.parse(readFileSync(resolve(ROOT, 'tsconfig.json'), 'utf8')) as { include: string[] };
    expect(ts.include.some((p) => p.startsWith('episodes'))).toBe(false);
    expect(readFileSync(resolve(ROOT, 'vitest.config.ts'), 'utf8')).not.toMatch(/episodes/);
  });

  it('the manifest parses and slugs are unique', () => {
    const m = EpisodeManifestSchema.parse(JSON.parse(readFileSync(resolve(ROOT, 'episodes/manifest.json'), 'utf8')));
    expect(new Set(m.episodes.map((e) => e.slug)).size).toBe(m.episodes.length);
    expect(m.episodes.filter((e) => e.approach === 'yaklasim').map((e) => e.slug)).toEqual(['rubik']);
  });
});
```
`git grep` exits 1 with no matches — wrap: catch the error and treat status 1 as `[]`.

- [ ] **Step 5: Point the remaining references at VideoGen**

- `apps/worker/src/real/steps.ts:86`:
```ts
/** The QC calibration "known bad" sample (video library L6): the pilot episode's final, copied into the data dir. */
export const DEFAULT_PILOT_VIDEO = join(process.env.VG_DATA_DIR ?? join(homedir(), 'videogen-data'), 'episodes/pilot-kalem/final.mp4');
```
(If `steps.ts` has a config object in reach, use `config.dataDir` instead of the env read.)
- `docs/machine-checklist.md`: replace the pilot path with `~/videogen-data/episodes/pilot-kalem/final.mp4` and its sha256.
- `Blender-3D-Cutaway-Kilavuzu.md:6`: `bin/blender-gpu` in this repo (also on PATH as `blender-gpu`).
- `ln -sfn /home/alper/gpu-server/VideoGen/bin/blender-gpu ~/.local/bin/blender-gpu` (points at main's checkout, which has the same file; do it after merge if the worktree is removed later — main already has `bin/blender-gpu`, so do it now).
Run the hygiene test: `npx vitest run packages/shared/test/repo-hygiene.test.ts` → PASS.

- [ ] **Step 6: The CLI — failing test first** (`apps/worker/test/import-episodes-cli.test.ts`; worker tests already run ffmpeg)

```ts
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../packages/db/test/helpers.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
let t: Awaited<ReturnType<typeof createTestDb>>;
const data = mkdtempSync(join(tmpdir(), 'vg-import-cli-'));
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

function clip(slug: string, size: string): string {
  const dir = join(data, 'episodes', slug);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, 'final.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=30:duration=1`, '-f', 'lavfi', '-i', 'sine=duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', f]);
  writeFileSync(join(dir, 'caption.txt'), `Inside ${slug}. Why?\n\n#test`);
  return createHash('sha256').update(readFileSync(f)).digest('hex');
}
const run = (manifest: string, ...extra: string[]) =>
  spawnSync('node', [join(ROOT, 'bin/import-episodes.mjs'), '--manifest', manifest, '--data-dir', data, ...extra], {
    encoding: 'utf8', env: { ...process.env, VG_DATABASE_URL: t.appUrl, VG_DATA_DIR: data },
  });

describe('bin/import-episodes.mjs (spec L8, L10)', () => {
  it('dry run writes nothing; real run imports, warns on a non-1080x1920 file, reports a missing one and exits 1; rerun says exists', async () => {
    const ok = clip('ok-ep', '1080x1920');
    const small = clip('small-ep', '720x1280');
    const e = (slug: string, sha: string) => ({ slug, product: `Ürün ${slug}`, title: `${slug} — what's inside`, language: 'en', audioMode: 'silent', approach: null, sha256: sha, recordedAt: '2026-10-07T12:00:00.000Z' });
    const manifest = join(data, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ episodes: [e('ok-ep', ok), e('small-ep', small), e('gone-ep', 'a'.repeat(64))] }));
    const dry = run(manifest, '--dry-run');
    expect(dry.stdout).toMatch(/ok-ep: would import/);
    expect(Number((await t.pool.query('SELECT count(*) FROM videos')).rows[0].count)).toBe(0);
    const r = run(manifest);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/ok-ep: imported/);
    expect(r.stdout).toMatch(/small-ep: imported \(warning: 720x1280/);
    expect(r.stdout).toMatch(/gone-ep: missing/);
    expect(Number((await t.pool.query("SELECT count(*) FROM videos WHERE origin = 'import'")).rows[0].count)).toBe(2);
    const again = run(manifest);
    expect(again.stdout).toMatch(/ok-ep: exists/);
  }, 60_000);
});
```
Check how other tests get an app-role URL from `createTestDb` (`t.appUrl` is used by the API test for the hub — reuse it).

- [ ] **Step 7: Run to see it fail**

Run: `npx vitest run apps/worker/test/import-episodes-cli.test.ts`
Expected: FAIL (`bin/import-episodes.mjs` missing).

- [ ] **Step 8: Implement `bin/import-episodes.mjs`**

```js
#!/usr/bin/env node
// Video library L8–L10: `node bin/import-episodes.mjs [--dry-run] [--manifest <path>] [--data-dir <dir>]` — the episodes listed in
// episodes/manifest.json, from <dataDir>/episodes/<slug>/final.mp4 (+ caption.txt), become ready, read-only videos in the Library.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { register } from 'tsx/esm/api';

register();
const ROOT = resolve(import.meta.dirname, '..');
const { values: o } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, manifest: { type: 'string' }, 'data-dir': { type: 'string' } } });
const { loadConfig, EpisodeManifestSchema } = await import('../packages/shared/src/index.ts');
const { createPool, fileSha256, importEpisode } = await import('../packages/db/src/index.ts');

const config = loadConfig();
const dataDir = o['data-dir'] ?? config.dataDir;
const manifest = EpisodeManifestSchema.parse(JSON.parse(readFileSync(o.manifest ?? join(ROOT, 'episodes/manifest.json'), 'utf8')));
const probe = (f) => {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,r_frame_rate:format=duration', '-of', 'json', f], { encoding: 'utf8' }));
  const s = j.streams[0];
  return { width: s.width, height: s.height, codec: s.codec_name, fps: s.r_frame_rate, durationMs: Math.round(Number(j.format.duration) * 1000) };
};

const pool = createPool(config.databaseUrl);
const tmp = mkdtempSync(join(tmpdir(), 'vg-import-'));
let failed = 0;
try {
  for (const e of manifest.episodes) {
    const dir = join(dataDir, 'episodes', e.slug);
    const file = join(dir, 'final.mp4');
    if (!existsSync(file)) { console.log(`${e.slug}: missing (${file})`); failed++; continue; }
    const sha = await fileSha256(file);
    if (sha !== e.sha256) { console.log(`${e.slug}: sha mismatch (file ${sha}, manifest ${e.sha256})`); failed++; continue; }
    const p = probe(file);
    const warn = p.width !== 1080 || p.height !== 1920 || p.fps !== '30/1' ? ` (warning: ${p.width}x${p.height} @ ${p.fps})` : '';
    if (o['dry-run']) { console.log(`${e.slug}: would import ${(p.durationMs / 1000).toFixed(1)} s${warn}`); continue; }
    const cover = join(tmp, `${e.slug}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-y', cover]);
    const captionFile = join(dir, 'caption.txt');
    const caption = existsSync(captionFile) ? readFileSync(captionFile, 'utf8') : null;
    const out = await importEpisode(pool, dataDir, e, { file, cover, durationMs: p.durationMs, width: p.width, height: p.height, codec: p.codec, caption });
    if (out.kind === 'sha_mismatch') { console.log(`${e.slug}: sha mismatch while storing (${out.actual})`); failed++; continue; }
    console.log(`${e.slug}: ${out.kind}${out.kind === 'imported' ? warn : ''}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await pool.end();
}
process.exit(failed ? 1 : 0);
```
(Check `createPool`'s signature in `packages/db/src/client.ts` and how `bin/safe-area.mjs` creates its pool; copy that.)

- [ ] **Step 9: Run tests**

Run: `npx vitest run apps/worker/test/import-episodes-cli.test.ts packages/shared/test/repo-hygiene.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: episodes copied into VideoGen — reference sources, YAKLASIM and prompts under docs/approach, sheet tools, manifest and the import CLI; QC pilot sample from the data dir; no reference to the old folder (spec L1–L8)"
```

---

### Task 7: Web view logic for platforms, filters and saving

**Files:**
- Create: `apps/web/src/lib/platform-view.ts`, `apps/web/test/platform-view.test.ts`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: shared `PLATFORMS`, `fileSlug`, `PlatformSummary`, `PlatformState`, `VideoView`.
- Produces:
```ts
export const PLATFORM_EN: Record<Platform, string>;              // YouTube, Instagram, TikTok
export const PLATFORM_SHORT: Record<Platform, string>;           // YT, IG, TT
export const STATUS_EN: Record<PlatformStatus, string>;          // none: 'Not uploaded', uploaded: 'Uploaded', outdated: 'Older version uploaded'
export type LibraryFilter = 'all' | 'yaklasim' | 'archive' | 'not-youtube' | 'not-instagram' | 'not-tiktok';
export const LIBRARY_FILTERS: [LibraryFilter, string][];
export function parseFilter(search: string): LibraryFilter;      // reads ?f=, falls back to 'all'
export function filterHref(f: LibraryFilter): string;            // '/library' or '/library?f=<f>'
export function matchesFilter(v: Pick<VideoView, 'approach' | 'platforms'>, f: LibraryFilter): boolean;
export function downloadName(productName: string): string;      // `${fileSlug(productName)}.mp4`
export function downloadHref(sha: string, productName: string): string; // `/api/blobs/<sha>?download=<name>`
export type SaveMode = 'share' | 'download';
export function saveMode(nav: { canShare?: (d: { files: File[] }) => boolean } | undefined, probe: File): SaveMode;
export function shareFailure(err: unknown): 'cancelled' | 'fallback';
```
- api client additions:
```ts
platforms: (id: string) => get<{ state: PlatformSummary; events: PlatformEvent[] }>(`/api/videos/${id}/platforms`),
markPlatform: (id: string, body: { platform: Platform; action: PlatformAction; uploadedAt?: string; url?: string; note?: string }) => write<{ event: PlatformEvent; video: VideoView }>(`/api/videos/${id}/platforms`, body),
setText: (id: string, body: { caption?: string | null; youtubeTitle?: string | null }) => write<VideoView>(`/api/videos/${id}/text`, body, 'PATCH'),
```
(`write`'s `method` union gains `'PATCH'`.)

- [ ] **Step 1: Write the failing test** (`apps/web/test/platform-view.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { summarizePlatforms } from '@videogen/shared/browser';
import { downloadHref, downloadName, filterHref, matchesFilter, parseFilter, PLATFORM_EN, saveMode, shareFailure, STATUS_EN } from '../src/lib/platform-view.ts';

const up = (versionId: string) => ({ action: 'uploaded' as const, versionId, uploadedAt: '2026-10-11T10:00:00.000Z', url: null });
const vid = (approach: 'yaklasim' | null, p: Parameters<typeof summarizePlatforms>[0]) => ({ approach, platforms: summarizePlatforms(p, 'v2') });
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

describe('platform view (spec L14, L19–L21)', () => {
  it('filters: approach chips and Not on X (outdated counts as not on X)', () => {
    const fresh = vid('yaklasim', { youtube: up('v2') });
    const old = vid(null, { youtube: up('v1'), instagram: up('v2') });
    expect(matchesFilter(fresh, 'all')).toBe(true);
    expect(matchesFilter(fresh, 'yaklasim')).toBe(true);
    expect(matchesFilter(old, 'yaklasim')).toBe(false);
    expect(matchesFilter(old, 'archive')).toBe(true);
    expect(matchesFilter(fresh, 'not-youtube')).toBe(false);
    expect(matchesFilter(old, 'not-youtube')).toBe(true);
    expect(matchesFilter(old, 'not-instagram')).toBe(false);
    expect(matchesFilter(fresh, 'not-tiktok')).toBe(true);
  });

  it('?f= round-trips and unknown values fall back to all', () => {
    expect(parseFilter('?f=not-instagram')).toBe('not-instagram');
    expect(parseFilter('?f=bogus')).toBe('all');
    expect(parseFilter('')).toBe('all');
    expect(filterHref('all')).toBe('/library');
    expect(filterHref('archive')).toBe('/library?f=archive');
  });

  it('download names pass the server rule', () => {
    expect(downloadName('Kulaklık')).toBe('kulaklik.mp4');
    expect(downloadHref('ab'.repeat(32), 'Rubik küpü')).toBe(`/api/blobs/${'ab'.repeat(32)}?download=rubik-kupu.mp4`);
    expect(downloadName('PS5 kolu')).toMatch(/^[a-z0-9][a-z0-9-]{0,79}\.mp4$/);
  });

  it('save mode: share only when the browser can share this file; a cancel is silent, other errors fall back to download', () => {
    const f = new File(['x'], 'x.mp4', { type: 'video/mp4' });
    expect(saveMode(undefined, f)).toBe('download');
    expect(saveMode({}, f)).toBe('download');
    expect(saveMode({ canShare: () => false }, f)).toBe('download');
    expect(saveMode({ canShare: () => true }, f)).toBe('share');
    expect(saveMode({ canShare: () => { throw new Error('nope'); } }, f)).toBe('download');
    expect(shareFailure(new DOMException('x', 'AbortError'))).toBe('cancelled');
    expect(shareFailure(new DOMException('x', 'NotAllowedError'))).toBe('fallback');
    expect(shareFailure(new Error('x'))).toBe('fallback');
  });

  it('labels are English', () => {
    for (const s of [...Object.values(PLATFORM_EN), ...Object.values(STATUS_EN)]) expect(s).not.toMatch(TURKISH);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run apps/web/test/platform-view.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `apps/web/src/lib/platform-view.ts`**

```ts
import { fileSlug, PLATFORMS, type Platform, type PlatformStatus, type VideoView } from '@videogen/shared/browser';
import { blobUrl } from './api.ts';

export const PLATFORM_EN: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };
export const PLATFORM_SHORT: Record<Platform, string> = { youtube: 'YT', instagram: 'IG', tiktok: 'TT' };
export const STATUS_EN: Record<PlatformStatus, string> = { none: 'Not uploaded', uploaded: 'Uploaded', outdated: 'Older version uploaded' };

export type LibraryFilter = 'all' | 'yaklasim' | 'archive' | 'not-youtube' | 'not-instagram' | 'not-tiktok';
export const LIBRARY_FILTERS: [LibraryFilter, string][] = [
  ['all', 'All'], ['yaklasim', 'YAKLASIM'], ['archive', 'Archive'],
  ['not-youtube', 'Not on YouTube'], ['not-instagram', 'Not on Instagram'], ['not-tiktok', 'Not on TikTok'],
];
const IDS = new Set(LIBRARY_FILTERS.map(([id]) => id));

export function parseFilter(search: string): LibraryFilter {
  const f = new URLSearchParams(search).get('f');
  return f && IDS.has(f as LibraryFilter) ? (f as LibraryFilter) : 'all';
}
export const filterHref = (f: LibraryFilter): string => (f === 'all' ? '/library' : `/library?f=${f}`);

/** Spec L21: "Not on X" means nothing current is there — never uploaded, undone, or only an older version. */
export function matchesFilter(v: Pick<VideoView, 'approach' | 'platforms'>, f: LibraryFilter): boolean {
  if (f === 'all') return true;
  if (f === 'yaklasim') return v.approach === 'yaklasim';
  if (f === 'archive') return v.approach !== 'yaklasim';
  const p = f.slice('not-'.length) as Platform;
  return PLATFORMS.includes(p) && v.platforms[p].status !== 'uploaded';
}

export const downloadName = (productName: string): string => `${fileSlug(productName)}.mp4`;
export const downloadHref = (sha: string, productName: string): string => `${blobUrl(sha)}?download=${downloadName(productName)}`;

export type SaveMode = 'share' | 'download';
/** Spec L20: Web Share with files (iPhone → "Save Video") when the browser says it can share this file; else a plain download. */
export function saveMode(nav: { canShare?: (d: { files: File[] }) => boolean } | undefined, probe: File): SaveMode {
  try { return nav?.canShare?.({ files: [probe] }) ? 'share' : 'download'; } catch { return 'download'; }
}
/** The user closing the share sheet is not an error; anything else falls back to the download link. */
export const shareFailure = (err: unknown): 'cancelled' | 'fallback' => ((err as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'fallback');
```
Add the three api client functions and `'PATCH'` to `write`'s method union in `apps/web/src/lib/api.ts`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/test/platform-view.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): platform view logic — labels, library filters, download names, share-or-download choice; api client for the upload log and texts (spec L19–L21)"
```

---

### Task 8: Platforms tab, Save to phone and library chips

**Files:**
- Create: `apps/web/src/components/platforms/PlatformsPanel.tsx`, `SaveToPhone.tsx`, `MarkUploadedSheet.tsx`, `VideoText.tsx`
- Modify: `apps/web/src/components/library/DetailTabs.tsx`, `apps/web/src/routes/LibraryDetail.tsx`, `apps/web/src/routes/Library.tsx`, the Studio component that renders the audio-edit card (grep `api.audioEdit`)

**Interfaces:**
- Consumes: Task 7's view module and api functions; `Sheet` (`components/shell/Sheet.tsx`: `{open, onClose, title, children, wide?}`); `blobUrl`; stores `seedVideos`.
- Produces: `DetailTab` = `'platforms' | 'versions' | 'reviews' | 'storyboard' | 'research' | 'audit'`; `data-testid`s used by the smoke test: `platforms-panel`, `platform-row-<platform>` (with `data-status`), `mark-uploaded-<platform>`, `undo-<platform>`, `mark-url`, `mark-save`, `save-to-phone`, `copy-caption`, `copy-title`, `library-filter-<id>`, `library-badge-<platform>` (with `data-status`), `library-imported`.

- [ ] **Step 1: DetailTabs**

```ts
export type DetailTab = 'platforms' | 'versions' | 'reviews' | 'storyboard' | 'research' | 'audit';
export const DETAIL_TABS: [DetailTab, string][] = [
  ['platforms', 'Platforms'], ['versions', 'Versions'], ['reviews', 'Reviews'], ['storyboard', 'Storyboard'], ['research', 'Research and sources'], ['audit', 'Audit log'],
];
```

- [ ] **Step 2: `SaveToPhone.tsx`** — two taps on share-capable browsers (spec L20)

```tsx
import { useRef, useState } from 'react';
import { downloadHref, downloadName, saveMode, shareFailure } from '../../lib/platform-view.ts';
import { blobUrl } from '../../lib/api.ts';

type Phase = { k: 'idle' } | { k: 'fetching'; pct: number | null } | { k: 'ready'; file: File } | { k: 'error'; msg: string };

/** Spec L20: fetch first (progress, cancellable), then share on a fresh tap — iOS refuses share() once the first tap's activation is spent. */
export function SaveToPhone({ sha, productName }: { sha: string; productName: string }) {
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const name = downloadName(productName);
  const href = downloadHref(sha, productName);
  const canShare = saveMode(typeof navigator === 'undefined' ? undefined : navigator, new File([], name, { type: 'video/mp4' })) === 'share';
  const btn = 'min-h-11 rounded-control bg-accent px-4 text-[14px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow';

  if (!canShare) return <a data-testid="save-to-phone" href={href} download={name} className={`${btn} inline-flex items-center justify-center`}>Save to phone</a>;

  const fetchFile = async () => {
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase({ k: 'fetching', pct: 0 });
    try {
      const r = await fetch(blobUrl(sha), { signal: ctl.signal });
      if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`);
      const total = Number(r.headers.get('content-length') ?? 0);
      const reader = r.body.getReader();
      const parts: BlobPart[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.byteLength;
        setPhase({ k: 'fetching', pct: total ? Math.round((got / total) * 100) : null });
      }
      setPhase({ k: 'ready', file: new File(parts, name, { type: 'video/mp4' }) });
    } catch (e) {
      setPhase((e as Error).name === 'AbortError' ? { k: 'idle' } : { k: 'error', msg: (e as Error).message });
    }
  };
  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file] });
      setPhase({ k: 'idle' });
    } catch (e) {
      if (shareFailure(e) === 'cancelled') return;
      setPhase({ k: 'error', msg: 'Sharing failed — use the download link instead.' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {phase.k === 'idle' && <button type="button" data-testid="save-to-phone" onClick={fetchFile} className={btn}>Save to phone</button>}
      {phase.k === 'fetching' && (
        <>
          <span data-testid="save-progress" className="text-[13px] tabular-nums text-ink-2">Preparing… {phase.pct === null ? '' : `${phase.pct}%`}</span>
          <button type="button" onClick={() => abort.current?.abort()} className="min-h-11 px-3 text-[13px] text-ink-2">Cancel</button>
        </>
      )}
      {phase.k === 'ready' && <button type="button" data-testid="save-video" onClick={() => share(phase.file)} className={btn}>Save video</button>}
      {phase.k === 'error' && (
        <>
          <span role="alert" className="text-[13px] text-red">{phase.msg}</span>
          <a href={href} download={name} className="min-h-11 inline-flex items-center text-[13px] text-accent-glow underline">Download instead</a>
        </>
      )}
    </div>
  );
}
```
(Check the colour token names — `text-red`, `bg-accent`, `text-accent-glow`, `rounded-control` exist in the Tailwind theme; reuse the ones in `Library.tsx`/`LibraryDetail.tsx`.)

- [ ] **Step 3: `VideoText.tsx`** — caption and YouTube title with Copy and Edit

```tsx
import { useState } from 'react';
import { CAPTION_MAX, YOUTUBE_TITLE_MAX, type VideoView } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { seedVideos } from '../../lib/stores.ts';

function Field({ label, testid, value, max, multiline, onSave }: { label: string; testid: string; value: string | null; max: number; multiline: boolean; onSave: (v: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const copy = async () => { if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const save = async () => { const e = await onSave(draft); setErr(e); if (!e) setEditing(false); };
  const input = 'w-full rounded-control border border-line-strong bg-inset px-3 py-2 text-[14px]';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ink-3">{label}</span>
        <button type="button" data-testid={`copy-${testid}`} disabled={!value} onClick={copy} className="ml-auto min-h-9 px-2 text-[13px] text-accent-glow disabled:text-ink-3">{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" onClick={() => { setDraft(value ?? ''); setEditing(!editing); }} className="min-h-9 px-2 text-[13px] text-ink-2">{editing ? 'Cancel' : 'Edit'}</button>
      </div>
      {editing ? (
        <>
          {multiline
            ? <textarea data-testid={`edit-${testid}`} value={draft} maxLength={max} rows={5} onChange={(e) => setDraft(e.target.value)} className={input} />
            : <input data-testid={`edit-${testid}`} value={draft} maxLength={max} onChange={(e) => setDraft(e.target.value)} className={input} />}
          <div className="flex items-center gap-2 text-[12px] text-ink-3"><span className="tabular-nums">{draft.length}/{max}</span>
            <button type="button" data-testid={`save-${testid}`} onClick={save} className="ml-auto min-h-9 rounded-control bg-accent px-3 text-[13px] text-white">Save</button></div>
          {err && <span role="alert" className="text-[12px] text-red">{err}</span>}
        </>
      ) : (
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{value ?? <span className="text-ink-3">Empty</span>}</p>
      )}
    </div>
  );
}

/** Spec L12/L22: the texts the user pastes into the platform apps. */
export function VideoText({ video }: { video: VideoView }) {
  const save = (field: 'caption' | 'youtubeTitle') => async (v: string) => {
    const r = await api.setText(video.id, { [field]: v });
    if (!r.ok) return r.error;
    seedVideos([r.data], 0);
    return null;
  };
  return (
    <section aria-label="Caption" className="flex flex-col gap-4 rounded-card bg-paper p-4">
      <Field label="Caption (all platforms)" testid="caption" value={video.caption} max={CAPTION_MAX} multiline onSave={save('caption')} />
      <Field label="YouTube title" testid="title" value={video.youtubeTitle} max={YOUTUBE_TITLE_MAX} multiline={false} onSave={save('youtubeTitle')} />
    </section>
  );
}
```
(Check `seedVideos`' second argument semantics in `lib/stores.ts`; if 0 would be ignored as stale, skip seeding — the SSE `video.updated` event updates the store anyway.)

- [ ] **Step 4: `MarkUploadedSheet.tsx`**

```tsx
import { useState } from 'react';
import type { Platform } from '@videogen/shared/browser';
import { Sheet } from '../shell/Sheet.tsx';
import { PLATFORM_EN } from '../../lib/platform-view.ts';

const localNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

/** Spec L22: when (default now), an optional link and note; the server validates (https, ≤ 500, not in the future). */
export function MarkUploadedSheet({ platform, onClose, onSave }: { platform: Platform | null; onClose: () => void; onSave: (p: Platform, b: { uploadedAt: string; url: string; note: string }) => Promise<string | null> }) {
  const [at, setAt] = useState(localNow());
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = 'w-full min-h-11 rounded-control border border-line-strong bg-inset px-3 text-[14px]';
  const submit = async () => {
    if (!platform) return;
    setBusy(true);
    const e = await onSave(platform, { uploadedAt: new Date(at).toISOString(), url, note });
    setBusy(false);
    setErr(e);
    if (!e) { setUrl(''); setNote(''); setAt(localNow()); }
  };
  return (
    <Sheet open={platform !== null} onClose={onClose} title={platform ? `Mark as uploaded on ${PLATFORM_EN[platform]}` : ''}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">When<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={input} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">Link (optional)<input data-testid="mark-url" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} className={input} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">Note (optional)<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={input} /></label>
        {err && <span role="alert" className="text-[13px] text-red">{err}</span>}
        <button type="button" data-testid="mark-save" disabled={busy} onClick={submit} className="min-h-11 rounded-control bg-accent text-[14px] font-medium text-white disabled:opacity-60">Save</button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 5: `PlatformsPanel.tsx`**

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PLATFORMS, type Platform, type VideoView } from '@videogen/shared/browser';
import { api, blobUrl } from '../../lib/api.ts';
import { formatDay } from '../../lib/production-view.ts';
import { PLATFORM_EN, STATUS_EN } from '../../lib/platform-view.ts';
import { MarkUploadedSheet } from './MarkUploadedSheet.tsx';
import { SaveToPhone } from './SaveToPhone.tsx';
import { VideoText } from './VideoText.tsx';

const TONE = { none: 'text-ink-3', uploaded: 'text-green', outdated: 'text-amber' } as const;

/** Spec L22: watch → save → copy → upload in the app → mark. The state comes from the live video row; the history from the log. */
export function PlatformsPanel({ video }: { video: VideoView }) {
  const qc = useQueryClient();
  const log = useQuery({ queryKey: ['platforms', video.id, video.updatedAt], queryFn: () => api.platforms(video.id) });
  const [sheet, setSheet] = useState<Platform | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const final = video.final;
  const mark = async (platform: Platform, body: { uploadedAt?: string; url?: string; note?: string } & { action?: 'uploaded' | 'retracted' }) => {
    const r = await api.markPlatform(video.id, { platform, action: body.action ?? 'uploaded', ...body });
    if (!r.ok) return r.error;
    await qc.invalidateQueries({ queryKey: ['platforms', video.id] });
    setSheet(null);
    return null;
  };
  if (!final) return <p className="text-[13px] text-ink-2">No final yet — nothing to save or upload.</p>;
  return (
    <div data-testid="platforms-panel" className="flex flex-col gap-4">
      <video src={blobUrl(final.videoSha)} poster={final.coverSha ? blobUrl(final.coverSha) : undefined} controls playsInline preload="metadata"
        className="mx-auto aspect-[9/16] max-h-[70dvh] w-full max-w-[360px] rounded-card bg-inset" />
      <SaveToPhone sha={final.videoSha} productName={video.productName} />
      <VideoText video={video} />
      <section aria-label="Platforms" className="flex flex-col divide-y divide-line rounded-card bg-paper">
        {PLATFORMS.map((p) => {
          const s = video.platforms[p];
          return (
            <div key={p} data-testid={`platform-row-${p}`} data-status={s.status} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-24 text-[14px] font-medium">{PLATFORM_EN[p]}</span>
              <span className={`flex-1 text-[13px] ${TONE[s.status]}`}>
                {STATUS_EN[s.status]}{s.uploadedAt ? ` · ${formatDay(s.uploadedAt)}` : ''}
                {s.url && <> · <a href={s.url} target="_blank" rel="noreferrer" className="text-accent-glow underline">open</a></>}
              </span>
              <button type="button" data-testid={`mark-uploaded-${p}`} onClick={() => setSheet(p)} className="min-h-10 rounded-control border border-line-strong px-3 text-[13px]">
                {s.status === 'none' ? 'Mark uploaded' : 'Uploaded again'}
              </button>
              {s.status !== 'none' && (
                <button type="button" data-testid={`undo-${p}`} onClick={async () => { if (window.confirm(`Undo the ${PLATFORM_EN[p]} upload mark?`)) setErr(await mark(p, { action: 'retracted' })); }}
                  className="min-h-10 px-2 text-[13px] text-ink-2">Undo</button>
              )}
            </div>
          );
        })}
      </section>
      {err && <span role="alert" className="text-[13px] text-red">{err}</span>}
      <section aria-label="Upload history" className="flex flex-col gap-1">
        <h3 className="text-[13px] font-medium text-ink-2">History</h3>
        {(log.data?.events ?? []).length === 0
          ? <p className="text-[13px] text-ink-3">Nothing marked yet.</p>
          : <ul data-testid="platform-history" className="flex flex-col gap-1 text-[13px]">
              {log.data!.events.map((e) => (
                <li key={e.id} className="text-ink-2">{formatDay(e.uploadedAt)} · {PLATFORM_EN[e.platform]} · {e.action === 'uploaded' ? 'uploaded' : 'undone'}{e.note ? ` · ${e.note}` : ''}</li>
              ))}
            </ul>}
      </section>
      <MarkUploadedSheet platform={sheet} onClose={() => setSheet(null)} onSave={(p, b) => mark(p, b)} />
    </div>
  );
}
```
Notes: `window.confirm` is a native dialog — acceptable in the app, but the smoke test must accept it (`page.once('dialog', d => d.accept())`). Check `VideoView.final`'s field names (`videoSha`/`coverSha` — read `toVideo` in `pipeline.ts`; adjust). Check `text-green`/`text-amber` tokens; use whatever the theme defines for ok/warning. `formatDay` must produce a date+time in Istanbul time; if it only formats a day, use the formatter the audit table uses for timestamps.

- [ ] **Step 6: LibraryDetail wiring**

- `const [tab, setTab] = useState<DetailTab>(() => (video?.origin === 'import' || window.matchMedia('(max-width: 599px)').matches ? 'platforms' : 'versions'));`
- add `{tab === 'platforms' && video && <PlatformsPanel video={video} />}`
- for `video?.origin === 'import'`, the reviews/storyboard/research tabs render `<p className="text-[13px] text-ink-2">Imported — produced outside the pipeline, so there is nothing here.</p>`.
- Studio: where the audio-edit card is rendered (grep `api.audioEdit`), render it only when `video.origin !== 'import'`.

- [ ] **Step 7: Library chips and badges**

In `Library.tsx`:
```tsx
const [filter, setFilter] = useState<LibraryFilter>(() => parseFilter(window.location.search));
const choose = (f: LibraryFilter) => { setFilter(f); window.history.replaceState(null, '', filterHref(f)); };
const shown = useMemo(() => videos.filter((v) => matchesFilter(v, filter)), [videos, filter]);
```
Render, above the list:
```tsx
<div role="group" aria-label="Filter" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
  {LIBRARY_FILTERS.map(([id, label]) => (
    <button key={id} type="button" data-testid={`library-filter-${id}`} aria-pressed={filter === id} onClick={() => choose(id)}
      className={`min-h-9 shrink-0 rounded-full px-3 text-[13px] whitespace-nowrap ${filter === id ? 'bg-accent text-white' : 'border border-line-strong text-ink-2'}`}>{label}</button>
  ))}
</div>
```
map over `shown` instead of `videos`; the count reads `${shown.length} of ${videos.length}` when a filter is on; an empty filtered list says `Nothing matches this filter.`. In each row, after the product name line, add:
```tsx
<span className="mt-1 flex gap-1">
  {PLATFORMS.map((p) => (
    <span key={p} data-testid={`library-badge-${p}`} data-status={v.platforms[p].status} title={`${PLATFORM_EN[p]}: ${STATUS_EN[v.platforms[p].status]}`}
      className={`rounded px-1 text-[10.5px] font-medium ${v.platforms[p].status === 'uploaded' ? 'bg-green/20 text-green' : v.platforms[p].status === 'outdated' ? 'bg-amber/20 text-amber' : 'bg-inset text-ink-3'}`}>{PLATFORM_SHORT[p]}</span>
  ))}
  {v.origin === 'import' && <span data-testid="library-imported" className="rounded bg-inset px-1 text-[10.5px] text-ink-3">Imported</span>}
</span>
```
(`go()` navigation must keep `?f=` — `go('/library')` from the detail back bar should become `go(history-aware back)`; simplest: in LibraryDetail's back handler use `window.history.length > 1 ? window.history.back() : go('/library')` only if the shell's back already does that; otherwise leave as is and accept the filter resetting on the explicit Back button but surviving the browser back gesture.)

- [ ] **Step 8: Typecheck, web unit tests, Turkish check, build**

Run: `npm run typecheck && npx vitest run apps/web && npm run build`
Expected: PASS (the `no-turkish-ui` test scans the new components).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(web): Platforms tab — player, two-tap Save to phone, caption and YouTube title copy/edit, mark uploaded / undo with history; library filter chips and YT/IG/TT badges; imported videos read-only (spec L11, L20–L22)"
```

---

### Task 9: Smoke S6 — import, mark, badge, undo

**Files:**
- Create: `tests/smoke/s6-platforms.spec.ts`
- Modify: `tests/smoke/playwright.config.ts` (only if specs are listed explicitly), `tests/smoke/screens.spec.ts` (if it screenshots the publish panel)

- [ ] **Step 1: Write the smoke test**

```ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { SMOKE_DIR } from './helpers.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const APP_SMOKE = 'postgres://videogen_app:videogen_app@127.0.0.1:5433/videogen_smoke';

function importOne(slug: string, product: string): void {
  const data = join(SMOKE_DIR, 'data');
  const dir = join(data, 'episodes', slug);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, 'final.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', f]);
  writeFileSync(join(dir, 'caption.txt'), `What's inside a ${product}? Hidden parts.\n\n#whatsinside`);
  const sha = createHash('sha256').update(readFileSync(f)).digest('hex');
  const manifest = join(SMOKE_DIR, `manifest-${slug}.json`);
  writeFileSync(manifest, JSON.stringify({ episodes: [{ slug, product, title: `${product} — what's inside`, language: 'en', audioMode: 'silent', approach: 'yaklasim', sha256: sha, recordedAt: new Date().toISOString() }] }));
  execFileSync('node', [join(ROOT, 'bin/import-episodes.mjs'), '--manifest', manifest, '--data-dir', data], { env: { ...process.env, VG_DATABASE_URL: APP_SMOKE, VG_DATA_DIR: data } });
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('S6: an imported episode is in the library; marked uploaded on Instagram from the Platforms tab, the badge and audit follow; undo clears it', async ({ page }) => {
  test.setTimeout(90_000);
  importOne('smoke-kup', 'Smoke küp');
  await page.goto('/library?f=not-instagram');
  const row = page.getByTestId('library-item').filter({ hasText: 'Smoke küp' });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTestId('library-imported')).toBeVisible();
  await row.click();
  const panel = page.getByTestId('platforms-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('save-to-phone')).toBeVisible();
  await panel.getByTestId('copy-caption').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("What's inside a Smoke küp?");
  await panel.getByTestId('mark-uploaded-instagram').click();
  await page.getByTestId('mark-url').fill('https://www.instagram.com/reel/smoke123/');
  await page.getByTestId('mark-save').click();
  await expect(panel.getByTestId('platform-row-instagram')).toHaveAttribute('data-status', 'uploaded');
  await expect(panel.getByTestId('platform-history')).toContainText('Instagram · uploaded');
  page.once('dialog', (d) => d.accept());
  await panel.getByTestId('undo-instagram').click();
  await expect(panel.getByTestId('platform-row-instagram')).toHaveAttribute('data-status', 'none');
  await page.goto('/audit');
  await expect(page.getByText('platform.retracted').first()).toBeVisible({ timeout: 10_000 });
});
```
(The `Audit` page shows action names; if it shows labels, match the label instead. On the mobile project the detail opens on Platforms by default; on desktop the imported origin also opens it — both paths covered by `origin === 'import'`.)

- [ ] **Step 2: Run the smoke suite**

Run: `npm run test:smoke` (starts its own stack on 5190; leave any running smoke stack alone if one is up — check `tests/smoke/playwright.config.ts` for reuse).
Expected: PASS for S1–S9 including the new S6, desktop and mobile projects.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(smoke): S6 imports an episode, marks it uploaded on Instagram, checks badge, history and audit, then undoes it"
```

---

### Task 10: Docs, memory and the final review

**Files:**
- Modify: `README.md` (phone section: Library → Platforms; remove TikTok connect text), `docs/machine-checklist.md` (drop TikTok API steps; add "import episodes" step), `.env.example` if it lists `VG_TIKTOK_*`
- Outside the repo: `~/.claude/projects/-home-alper/memory/icinde-ne-var-*.md`, `~/.claude/projects/-home-alper-gpu-server/memory/videogen-platform.md`, this project's memory

- [ ] **Step 1: Docs** — README and checklist updated; `grep -rn "VG_TIKTOK\|tiktok_api\|/api/tiktok" README.md docs/*.md` → empty (historical `docs/superpowers` and `docs/m5` untouched).
- [ ] **Step 2: Memory** — rewrite the old channel memory files to say the episodes, YAKLASIM and tooling live in VideoGen (`episodes/`, `docs/approach/`, `bin/`), finals in `~/videogen-data/episodes/`; uploads are manual, tracked in the app.
- [ ] **Step 3: Full verification**

Run: `npm run typecheck && VG_TEST_WORKERS=4 npm test && npm run build && npm run test:smoke`
Expected: all PASS. Record the counts.
- [ ] **Step 4: Whole-branch review** — invoke superpowers:requesting-code-review on `main..video-library`, fix findings, re-run Step 3.
- [ ] **Step 5: Commit** docs; then stop and ask the user before merging into main, migrating the live DB, restarting `videogen.service` and running the real import (these touch the running service and the real database).

After approval (not part of the unattended run):
```bash
cd /home/alper/gpu-server/VideoGen && git merge --ff-only video-library && npm install && npm run db:migrate && npm run build \
  && systemctl --user restart videogen && node bin/import-episodes.mjs
```
Then on the phone (tailnet 8443): Library → rubik → Save to phone → mark one platform → undo; Audit shows both rows and the chain verifies.
