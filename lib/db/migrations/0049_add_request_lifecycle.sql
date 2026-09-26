CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"issue_id" uuid,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "comments_one_parent_check" CHECK (("comments"."request_id" is null) <> ("comments"."issue_id" is null))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_event_type_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "issue_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "add_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "add_error" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "add_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_request_created_idx" ON "comments" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_issue_created_idx" ON "comments" USING btree ("issue_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_type_check" CHECK ("notifications"."event_type" in ('grabbed','downloaded','request_approved','request_rejected','issue_reported','issue_resolved','request_created','title_shared','request_not_found','request_comment','issue_comment'));