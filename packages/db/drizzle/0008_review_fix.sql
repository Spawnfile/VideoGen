CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"severity" text NOT NULL,
	"dimension" text,
	"gate" text,
	"evidence" jsonb,
	"fix_hint" text,
	"status" text DEFAULT 'open' NOT NULL,
	"fixed_in_version_id" uuid,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"version_id" uuid,
	"run_id" uuid NOT NULL,
	"step_id" uuid,
	"round" integer NOT NULL,
	"reviewer_role" text NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"session_id" uuid,
	"rubric_version" text NOT NULL,
	"total" real,
	"dimension_scores" jsonb,
	"gates" jsonb,
	"verdict" text,
	"summary_tr" text,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "fix_round" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_fixed_in_version_id_versions_id_fk" FOREIGN KEY ("fixed_in_version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_round_role_uq" ON "reviews" USING btree ("run_id","round","reviewer_role","seq");--> statement-breakpoint
CREATE INDEX "reviews_video_idx" ON "reviews" USING btree ("video_id","created_at");