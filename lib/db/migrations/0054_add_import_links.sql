CREATE TABLE "import_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"instance" text NOT NULL,
	"kind" text NOT NULL,
	"source_id" integer NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_links_source_check" CHECK ("import_links"."source" in ('seerr')),
	CONSTRAINT "import_links_kind_check" CHECK ("import_links"."kind" in ('user','request','issue','comment','blocklist'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "import_links_source_idx" ON "import_links" USING btree ("source","instance","kind","source_id");--> statement-breakpoint
CREATE INDEX "import_links_target_idx" ON "import_links" USING btree ("target_id");