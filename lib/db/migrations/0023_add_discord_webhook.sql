ALTER TABLE "app_settings" ADD COLUMN "discord_webhook_url_enc" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "discord_webhook_url_iv" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "discord_webhook_url_tag" "bytea";