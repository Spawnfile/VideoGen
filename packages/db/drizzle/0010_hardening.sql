CREATE TABLE "maintenance_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp (6) with time zone,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "revoked_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "updated_at" timestamp (6) with time zone;--> statement-breakpoint
ALTER TABLE "blobs" ADD COLUMN "touched_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_one_running" ON "maintenance_runs" USING btree ((true)) WHERE status = 'running';--> statement-breakpoint
CREATE INDEX "maintenance_runs_kind_idx" ON "maintenance_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE INDEX "audit_log_run_seq_idx" ON "audit_log" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "audit_log_session_seq_idx" ON "audit_log" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "audit_log_subject_seq_idx" ON "audit_log" USING btree ("subject_type","subject_id","seq");--> statement-breakpoint
CREATE INDEX "audit_log_action_seq_idx" ON "audit_log" USING btree ("action","seq");--> statement-breakpoint
CREATE INDEX "audit_log_ts_idx" ON "audit_log" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "versions_video_round_idx" ON "versions" USING btree ("video_id","round");--> statement-breakpoint
ALTER TABLE "maintenance_runs" ADD CONSTRAINT "maintenance_runs_kind_ck" CHECK (kind IN ('backup','gc_report','gc_delete','orphan_report'));--> statement-breakpoint
ALTER TABLE "maintenance_runs" ADD CONSTRAINT "maintenance_runs_status_ck" CHECK (status IN ('running','done','failed'));--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON maintenance_runs FROM videogen_app;
