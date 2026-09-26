CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"poster_path" text,
	"season_number" integer,
	"episode_number" integer,
	"kind" text NOT NULL,
	"message" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_status_check" CHECK ("issues"."status" in ('open','resolved')),
	CONSTRAINT "issues_kind_check" CHECK ("issues"."kind" in ('video','audio','subtitles','wont_play','wrong_title','other'))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_event_type_check";--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_status_created_idx" ON "issues" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "issues_reported_by_idx" ON "issues" USING btree ("reported_by_user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_type_check" CHECK ("notifications"."event_type" in ('grabbed','downloaded','request_approved','request_rejected','issue_reported','issue_resolved'));