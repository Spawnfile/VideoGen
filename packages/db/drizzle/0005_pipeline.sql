CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid,
	"run_id" uuid NOT NULL,
	"step_id" uuid,
	"kind" text NOT NULL,
	"blob_sha" text,
	"content" jsonb,
	"input_hash" text,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"codec" text,
	"meta" jsonb,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"step_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" text NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"difficulty" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"trigger" text NOT NULL,
	"parent_run_id" uuid,
	"plan" jsonb NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"eta_s" integer,
	"status" text NOT NULL,
	"error" text,
	"usage_start" jsonb,
	"usage_end" jsonb,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"key" text NOT NULL,
	"ordinal" integer NOT NULL,
	"weight" real NOT NULL,
	"status" text NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"progress_source" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"input_hash" text,
	"session_id" uuid,
	"error" text,
	"note" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"round" integer DEFAULT 0 NOT NULL,
	"spec_hash" text,
	"src_hash" text,
	"reason" text NOT NULL,
	"created_by_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"audio_mode" text NOT NULL,
	"language" text DEFAULT 'tr' NOT NULL,
	"status" text NOT NULL,
	"status_note" text,
	"current_version_id" uuid,
	"best_version_id" uuid,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_blob_sha_blobs_sha256_fk" FOREIGN KEY ("blob_sha") REFERENCES "public"."blobs"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_parent_run_id_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_parent_version_id_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_run_kind_idx" ON "artifacts" USING btree ("run_id","kind");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","resource","priority","id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_one_active_per_step_uq" ON "jobs" USING btree ("step_id") WHERE status IN ('queued', 'leased');--> statement-breakpoint
CREATE UNIQUE INDEX "products_normalized_name_uq" ON "products" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "runs_video_idx" ON "runs" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_one_active_per_video_uq" ON "runs" USING btree ("video_id") WHERE status IN ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "steps_run_ordinal_uq" ON "steps" USING btree ("run_id","ordinal");--> statement-breakpoint
CREATE INDEX "videos_updated_idx" ON "videos" USING btree ("updated_at");