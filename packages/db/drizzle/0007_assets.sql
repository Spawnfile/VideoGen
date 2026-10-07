CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"blob_sha" text NOT NULL,
	"license_spdx" text NOT NULL,
	"source_url" text,
	"author" text NOT NULL,
	"attribution" text,
	"license_snapshot_sha" text,
	"allowed" boolean NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_blob_sha_blobs_sha256_fk" FOREIGN KEY ("blob_sha") REFERENCES "public"."blobs"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_license_snapshot_sha_blobs_sha256_fk" FOREIGN KEY ("license_snapshot_sha") REFERENCES "public"."blobs"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_kind_idx" ON "assets" USING btree ("kind","allowed");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_blob_kind_uq" ON "assets" USING btree ("blob_sha","kind");