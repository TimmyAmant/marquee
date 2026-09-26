ALTER TABLE "notifications" DROP CONSTRAINT "notifications_event_type_check";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "not_found_after_hours" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "not_found_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "not_found_alerts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "not_found_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "not_found_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "not_found_arr_path" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_type_check" CHECK ("notifications"."event_type" in ('grabbed','downloaded','request_approved','request_rejected','issue_reported','issue_resolved','request_created','title_shared','request_not_found'));