import { bigint, bigserial, index, jsonb, pgTable, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
