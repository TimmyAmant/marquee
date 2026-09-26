CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"target" text NOT NULL,
	"config_enc" "bytea" NOT NULL,
	"config_iv" "bytea" NOT NULL,
	"config_tag" "bytea" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"verify_code_hash" text,
	"verify_expires_at" timestamp with time zone,
	"verify_attempts" integer DEFAULT 0 NOT NULL,
	"events" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_channels_kind_check" CHECK ("user_notification_channels"."kind" in ('telegram','pushover','email','discord','ntfy','webhook'))
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "household_notification_events" text[];--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "in_bell" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "alert" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notification_channels_user_idx" ON "user_notification_channels" USING btree ("user_id");