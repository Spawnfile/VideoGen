CREATE TABLE "claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"claim_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text_tr" text NOT NULL,
	"sources" jsonb NOT NULL,
	"status" text NOT NULL,
	"verified_at" timestamp (6) with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"target" text DEFAULT 'tiktok_draft' NOT NULL,
	"variant" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"blob_sha" text NOT NULL,
	"bytes" bigint NOT NULL,
	"publish_id" text,
	"fail_reason" text,
	"error_code" text,
	"caption" text NOT NULL,
	"aigc_required" boolean NOT NULL,
	"checklist" jsonb,
	"url" text,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp (6) with time zone,
	"published_at" timestamp (6) with time zone,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_version_claim_uq" ON "claims" USING btree ("version_id","claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_one_active" ON "publications" USING btree ("video_id") WHERE status IN ('queued','uploading','processing','waiting');--> statement-breakpoint
CREATE INDEX "publications_created_at" ON "publications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "publications_video_idx" ON "publications" USING btree ("video_id","created_at");--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_status_ck" CHECK (status IN ('queued','uploading','processing','sent','waiting','failed','published'));--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_variant_ck" CHECK (variant IN ('tiktok','music'));--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_target_ck" CHECK (target IN ('tiktok_draft'));--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_status_ck" CHECK (status IN ('verified','unverified'));--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON claims FROM videogen_app;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON publications FROM videogen_app;
