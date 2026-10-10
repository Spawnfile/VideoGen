ALTER TABLE "videos" ADD COLUMN "brief" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "duration_min_s" integer DEFAULT 35 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "duration_max_s" integer DEFAULT 55 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "duration_source" text DEFAULT 'default' NOT NULL;