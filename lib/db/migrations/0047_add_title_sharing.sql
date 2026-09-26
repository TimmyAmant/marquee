ALTER TABLE "notifications" DROP CONSTRAINT "notifications_event_type_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "sender_user_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_type_check" CHECK ("notifications"."event_type" in ('grabbed','downloaded','request_approved','request_rejected','issue_reported','issue_resolved','request_created','title_shared'));