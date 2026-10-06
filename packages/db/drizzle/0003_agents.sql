CREATE TABLE "agent_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"turn" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"parent_tool_use_id" text,
	"tool_use_id" text,
	"task_id" text,
	"payload" jsonb NOT NULL,
	"ts" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"model" text NOT NULL,
	"effort" text NOT NULL,
	"status" text NOT NULL,
	"claude_session_id" uuid NOT NULL,
	"parent_session_id" uuid,
	"thread_id" uuid,
	"run_id" text,
	"step_id" text,
	"run_dir" text NOT NULL,
	"progress" real,
	"progress_source" text,
	"progress_message" text,
	"usage" jsonb,
	"cost_usd" double precision,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"num_turns" integer DEFAULT 0 NOT NULL,
	"terminal_reason" text,
	"error" text,
	"permission_denials" jsonb,
	"sdk_version" text,
	"cli_version" text,
	"pid" integer,
	"transcript_blob_sha" text,
	"raw_path" text,
	"waiting_until" timestamp with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_event_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"sha256" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"bytes" bigint NOT NULL,
	"mime" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"status" text NOT NULL,
	"session_id" uuid,
	"turn" integer,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" text,
	"title" text NOT NULL,
	"claude_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_parent_session_id_agent_sessions_id_fk" FOREIGN KEY ("parent_session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_events_session_seq_uq" ON "agent_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "agent_sessions_status_idx" ON "agent_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_sessions_thread_idx" ON "agent_sessions" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON agent_events FROM videogen_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vg_publish_event(p_topic text, p_type text, p_payload jsonb) RETURNS ui_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r ui_events;
BEGIN
  -- Commit order == id order: the advisory lock serializes nextval and commit (held until the caller's transaction ends),
  -- so SSE replay by id can never skip an event that commits late with a smaller id.
  PERFORM pg_advisory_xact_lock(72720001);
  INSERT INTO ui_events (ts, topic, type, payload) VALUES (clock_timestamp(), p_topic, p_type, p_payload) RETURNING * INTO r;
  PERFORM pg_notify('vg_events', r.id::text);
  RETURN r;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION vg_publish_event(text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION vg_publish_event(text, text, jsonb) TO videogen_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE ON ui_events FROM videogen_app;
