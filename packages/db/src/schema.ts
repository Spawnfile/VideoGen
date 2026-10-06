import { type AnyPgColumn, bigint, bigserial, doublePrecision, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
