import { type AnyPgColumn, bigint, bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    seq: bigint('seq', { mode: 'number' }).notNull().default(0),
    ts: timestamp('ts', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    subjectType: text('subject_type'),
    subjectId: text('subject_id'),
    runId: text('run_id'),
    stepId: text('step_id'),
    sessionId: text('session_id'),
    toolUseId: text('tool_use_id'),
    data: jsonb('data'),
    prevHash: text('prev_hash').notNull().default(''),
    hash: text('hash').notNull().default(''),
  },
  (t) => [uniqueIndex('audit_log_seq_uq').on(t.seq)],
);

export const uiEvents = pgTable(
  'ui_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ts: timestamp('ts', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
    topic: text('topic').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
  },
  (t) => [index('ui_events_topic_id_idx').on(t.topic, t.id)],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usageSnapshots = pgTable('usage_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  source: text('source').notNull(),
  fiveHourUtil: real('five_hour_util'),
  fiveHourResetsAt: timestamp('five_hour_resets_at', { withTimezone: true }),
  sevenDayUtil: real('seven_day_util'),
  sevenDayResetsAt: timestamp('seven_day_resets_at', { withTimezone: true }),
  status: text('status'),
  subscriptionType: text('subscription_type'),
});

export const chatThreads = pgTable('chat_threads', {
  id: uuid('id').primaryKey(),
  videoId: text('video_id'),
  title: text('title').notNull(),
  claudeSessionId: uuid('claude_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    role: text('role').notNull(),
    model: text('model').notNull(),
    effort: text('effort').notNull(),
    status: text('status').notNull(),
    claudeSessionId: uuid('claude_session_id').notNull(),
    parentSessionId: uuid('parent_session_id').references((): AnyPgColumn => agentSessions.id),
    threadId: uuid('thread_id').references(() => chatThreads.id),
    runId: text('run_id'),
    stepId: text('step_id'),
    runDir: text('run_dir').notNull(),
    progress: real('progress'),
    progressSource: text('progress_source'),
    progressMessage: text('progress_message'),
    usage: jsonb('usage'),
    costUsd: doublePrecision('cost_usd'),
    tokens: bigint('tokens', { mode: 'number' }).notNull().default(0),
    numTurns: integer('num_turns').notNull().default(0),
    terminalReason: text('terminal_reason'),
    error: text('error'),
    permissionDenials: jsonb('permission_denials'),
    sdkVersion: text('sdk_version'),
    cliVersion: text('cli_version'),
    pid: integer('pid'),
    transcriptBlobSha: text('transcript_blob_sha'),
    rawPath: text('raw_path'),
    waitingUntil: timestamp('waiting_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  },
  (t) => [index('agent_sessions_status_idx').on(t.status), index('agent_sessions_thread_idx').on(t.threadId, t.createdAt)],
);

export const agentEvents = pgTable(
  'agent_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: uuid('session_id').notNull().references(() => agentSessions.id),
    seq: integer('seq').notNull(),
    turn: integer('turn').notNull().default(0),
    type: text('type').notNull(),
    subtype: text('subtype'),
    parentToolUseId: text('parent_tool_use_id'),
    toolUseId: text('tool_use_id'),
    taskId: text('task_id'),
    payload: jsonb('payload').notNull(),
    ts: timestamp('ts', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('agent_events_session_seq_uq').on(t.sessionId, t.seq)],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey(),
    threadId: uuid('thread_id').notNull().references(() => chatThreads.id),
    role: text('role').notNull(),
    text: text('text').notNull(),
    status: text('status').notNull(),
    mode: text('mode').notNull().default('ask'),
    sessionId: uuid('session_id'),
    turn: integer('turn'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('chat_messages_thread_idx').on(t.threadId, t.createdAt)],
);

export const blobs = pgTable('blobs', {
  sha256: text('sha256').primaryKey(),
  path: text('path').notNull(),
  bytes: bigint('bytes', { mode: 'number' }).notNull(),
  mime: text('mime').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    difficulty: text('difficulty'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('products_normalized_name_uq').on(t.normalizedName)],
);

export const videos = pgTable(
  'videos',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id').notNull().references(() => products.id),
    title: text('title').notNull(),
    audioMode: text('audio_mode').notNull(),
    language: text('language').notNull().default('tr'),
    status: text('status').notNull(),
    statusNote: text('status_note'),
    currentVersionId: uuid('current_version_id'),
    bestVersionId: uuid('best_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [index('videos_updated_idx').on(t.updatedAt)],
);

export const versions = pgTable('versions', {
  id: uuid('id').primaryKey(),
  videoId: uuid('video_id').notNull().references(() => videos.id),
  parentVersionId: uuid('parent_version_id').references((): AnyPgColumn => versions.id),
  round: integer('round').notNull().default(0),
  specHash: text('spec_hash'),
  srcHash: text('src_hash'),
  reason: text('reason').notNull(),
  createdBySessionId: uuid('created_by_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey(),
    videoId: uuid('video_id').notNull().references(() => videos.id),
    kind: text('kind').notNull(),
    trigger: text('trigger').notNull(),
    parentRunId: uuid('parent_run_id').references((): AnyPgColumn => runs.id),
    plan: jsonb('plan').notNull(),
    progress: real('progress').notNull().default(0),
    etaS: integer('eta_s'),
    status: text('status').notNull(),
    error: text('error'),
    usageStart: jsonb('usage_start'),
    usageEnd: jsonb('usage_end'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('runs_video_idx').on(t.videoId, t.createdAt),
    uniqueIndex('runs_one_active_per_video_uq').on(t.videoId).where(sql`status IN ('queued', 'running')`),
  ],
);

export const steps = pgTable(
  'steps',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id').notNull().references(() => runs.id),
    key: text('key').notNull(),
    ordinal: integer('ordinal').notNull(),
    weight: real('weight').notNull(),
    status: text('status').notNull(),
    progress: real('progress').notNull().default(0),
    progressSource: text('progress_source'),
    attempt: integer('attempt').notNull().default(0),
    /** Draft review returns (plan C6, inherited D5): bumped for every step the review sends back; `attempt` restarts per round. */
    round: integer('round').notNull().default(0),
    /** Final review fix rounds (plan F3, migration 0008): bumped for compose…review (or build…review, storyboard…review); `round` stays the draft counter. */
    fixRound: integer('fix_round').notNull().default(0),
    inputHash: text('input_hash'),
    sessionId: uuid('session_id'),
    error: text('error'),
    note: text('note'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('steps_run_ordinal_uq').on(t.runId, t.ordinal)],
);

export const jobs = pgTable(
  'jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    stepId: uuid('step_id').notNull().references(() => steps.id),
    resource: text('resource').notNull(),
    priority: integer('priority').notNull().default(100),
    status: text('status').notNull(),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('jobs_claim_idx').on(t.status, t.resource, t.priority, t.id),
    uniqueIndex('jobs_one_active_per_step_uq').on(t.stepId).where(sql`status IN ('queued', 'leased')`),
  ],
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey(),
    versionId: uuid('version_id').references(() => versions.id),
    runId: uuid('run_id').notNull().references(() => runs.id),
    stepId: uuid('step_id').references(() => steps.id),
    kind: text('kind').notNull(),
    blobSha: text('blob_sha').references(() => blobs.sha256),
    content: jsonb('content'),
    inputHash: text('input_hash'),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    codec: text('codec'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [index('artifacts_run_kind_idx').on(t.runId, t.kind)],
);
/** Spec §9 / §11.1 asset ledger (migration 0007, plan E13). `allowed` is the license gate's verdict at import time. */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    blobSha: text('blob_sha').notNull().references(() => blobs.sha256),
    licenseSpdx: text('license_spdx').notNull(),
    sourceUrl: text('source_url'),
    author: text('author').notNull(),
    attribution: text('attribution'),
    licenseSnapshotSha: text('license_snapshot_sha').references(() => blobs.sha256),
    allowed: boolean('allowed').notNull(),
    platforms: jsonb('platforms').notNull().default([]),
    tags: jsonb('tags').notNull().default([]),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [index('assets_kind_idx').on(t.kind, t.allowed), uniqueIndex('assets_blob_kind_uq').on(t.blobSha, t.kind)],
);

/** Spec §11.1 review rows (migration 0008, plan F22): one per reviewer and round, plus the `orchestrator` round summary. `seq` 2 = the second visual review. */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey(),
    videoId: uuid('video_id').notNull().references(() => videos.id),
    versionId: uuid('version_id').references(() => versions.id),
    runId: uuid('run_id').notNull().references(() => runs.id),
    stepId: uuid('step_id').references(() => steps.id),
    round: integer('round').notNull(),
    reviewerRole: text('reviewer_role').notNull(),
    seq: integer('seq').notNull().default(1),
    sessionId: uuid('session_id'),
    rubricVersion: text('rubric_version').notNull(),
    total: real('total'),
    dimensionScores: jsonb('dimension_scores'),
    gates: jsonb('gates'),
    verdict: text('verdict'),
    summaryTr: text('summary_tr'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reviews_round_role_uq').on(t.runId, t.round, t.reviewerRole, t.seq), index('reviews_video_idx').on(t.videoId, t.createdAt)],
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey(),
    reviewId: uuid('review_id').notNull().references(() => reviews.id),
    checkId: text('check_id').notNull(),
    severity: text('severity').notNull(),
    dimension: text('dimension'),
    gate: text('gate'),
    evidence: jsonb('evidence'),
    fixHint: text('fix_hint'),
    status: text('status').notNull().default('open'),
    fixedInVersionId: uuid('fixed_in_version_id').references(() => versions.id),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [index('findings_review_idx').on(t.reviewId)],
);

/** Plan M6 Y14: one row per TikTok draft send; the version and file are pinned at queue time (Y4). Never deleted (0009 REVOKE). */
export const publications = pgTable(
  'publications',
  {
    id: uuid('id').primaryKey(),
    videoId: uuid('video_id').notNull().references(() => videos.id),
    versionId: uuid('version_id').notNull().references(() => versions.id),
    target: text('target').notNull().default('tiktok_draft'),
    variant: text('variant').notNull(),
    status: text('status').notNull().default('queued'),
    blobSha: text('blob_sha').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    publishId: text('publish_id'),
    failReason: text('fail_reason'),
    errorCode: text('error_code'),
    caption: text('caption').notNull(),
    aigcRequired: boolean('aigc_required').notNull(),
    checklist: jsonb('checklist'),
    url: text('url'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true, precision: 6 }),
    publishedAt: timestamp('published_at', { withTimezone: true, precision: 6 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('publications_one_active').on(t.videoId).where(sql`status IN ('queued','uploading','processing','waiting')`),
    index('publications_created_at').on(t.createdAt),
    index('publications_video_idx').on(t.videoId, t.createdAt),
  ],
);

/** Spec §11.1 claims: the published version's claims, snapshotted at its first send (plan M6 Y15). Status is per gate (G2), not per claim. */
export const claims = pgTable(
  'claims',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    videoId: uuid('video_id').notNull().references(() => videos.id),
    versionId: uuid('version_id').notNull().references(() => versions.id),
    claimId: text('claim_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    textTr: text('text_tr').notNull(),
    sources: jsonb('sources').notNull(),
    status: text('status').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, precision: 6 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('claims_version_claim_uq').on(t.versionId, t.claimId)],
);
