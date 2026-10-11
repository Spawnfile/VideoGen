DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM publications) THEN RAISE EXCEPTION 'publications has rows; refusing to drop (video library L25)'; END IF;
END $$;--> statement-breakpoint
CREATE TABLE "platform_uploads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"action" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"url" text,
	"note" text,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "publications" CASCADE;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "origin" text DEFAULT 'pipeline' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "approach" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "youtube_title" text;--> statement-breakpoint
ALTER TABLE "platform_uploads" ADD CONSTRAINT "platform_uploads_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_uploads" ADD CONSTRAINT "platform_uploads_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_uploads_video_idx" ON "platform_uploads" USING btree ("video_id","platform","id");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_origin_ck" CHECK (origin IN ('pipeline','import'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_approach_ck" CHECK (approach IS NULL OR approach IN ('yaklasim'));--> statement-breakpoint
ALTER TABLE "platform_uploads" ADD CONSTRAINT "platform_uploads_platform_ck" CHECK (platform IN ('youtube','instagram','tiktok'));--> statement-breakpoint
ALTER TABLE "platform_uploads" ADD CONSTRAINT "platform_uploads_action_ck" CHECK (action IN ('uploaded','retracted'));--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON platform_uploads FROM videogen_app;--> statement-breakpoint
UPDATE videos SET status = 'ready' WHERE status = 'published';
