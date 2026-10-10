ALTER TABLE "runs" ADD COLUMN "instruction" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;