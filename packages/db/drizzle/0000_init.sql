CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"ts" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"run_id" text,
	"step_id" text,
	"session_id" text,
	"tool_use_id" text,
	"data" jsonb,
	"prev_hash" text DEFAULT '' NOT NULL,
	"hash" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"topic" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"five_hour_util" real,
	"five_hour_resets_at" timestamp with time zone,
	"seven_day_util" real,
	"seven_day_resets_at" timestamp with time zone,
	"status" text,
	"subscription_type" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_log_seq_uq" ON "audit_log" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "ui_events_topic_id_idx" ON "ui_events" USING btree ("topic","id");