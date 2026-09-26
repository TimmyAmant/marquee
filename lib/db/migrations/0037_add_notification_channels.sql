CREATE TABLE "notification_channels" (
	"kind" text PRIMARY KEY NOT NULL,
	"config_enc" "bytea" NOT NULL,
	"config_iv" "bytea" NOT NULL,
	"config_tag" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_channels_kind_check" CHECK ("notification_channels"."kind" in ('telegram','pushover','email'))
);
