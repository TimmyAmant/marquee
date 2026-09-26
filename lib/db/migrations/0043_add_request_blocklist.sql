CREATE TABLE "request_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"media_type" text,
	"tmdb_id" integer,
	"title" text,
	"keyword" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_blocklist_kind_check" CHECK ("request_blocklist"."kind" in ('title','keyword'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "request_blocklist_title_idx" ON "request_blocklist" USING btree ("media_type","tmdb_id") WHERE "request_blocklist"."kind" = 'title';--> statement-breakpoint
CREATE UNIQUE INDEX "request_blocklist_keyword_idx" ON "request_blocklist" USING btree ("keyword") WHERE "request_blocklist"."kind" = 'keyword';