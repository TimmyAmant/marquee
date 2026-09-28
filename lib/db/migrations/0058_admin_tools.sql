CREATE TABLE "arr_override_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"genres" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"quality_profile_id" integer,
	"root_folder_path" text,
	"tags" integer[],
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_channels" DROP CONSTRAINT "notification_channels_kind_check";--> statement-breakpoint
ALTER TABLE "request_blocklist" DROP CONSTRAINT "request_blocklist_kind_check";--> statement-breakpoint
ALTER TABLE "user_notification_channels" DROP CONSTRAINT "user_notification_channels_kind_check";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "job_schedules" jsonb;--> statement-breakpoint
ALTER TABLE "request_blocklist" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "arr_override_rules" ADD CONSTRAINT "arr_override_rules_server_id_arr_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."arr_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arr_override_rules_server_idx" ON "arr_override_rules" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_blocklist_certification_idx" ON "request_blocklist" USING btree ("region","keyword") WHERE "request_blocklist"."kind" = 'certification';--> statement-breakpoint
CREATE UNIQUE INDEX "request_blocklist_adult_idx" ON "request_blocklist" USING btree ("kind") WHERE "request_blocklist"."kind" = 'adult';--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_kind_check" CHECK ("notification_channels"."kind" in ('telegram','pushover','email','gotify','slack','pushbullet'));--> statement-breakpoint
ALTER TABLE "request_blocklist" ADD CONSTRAINT "request_blocklist_kind_check" CHECK ("request_blocklist"."kind" in ('title','keyword','certification','adult'));--> statement-breakpoint
ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_kind_check" CHECK ("user_notification_channels"."kind" in ('telegram','pushover','email','discord','ntfy','webhook','slack','gotify','pushbullet'));