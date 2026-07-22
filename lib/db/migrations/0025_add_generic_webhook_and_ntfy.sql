ALTER TABLE "app_settings" ADD COLUMN "generic_webhook_url_enc" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "generic_webhook_url_iv" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "generic_webhook_url_tag" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "ntfy_url_enc" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "ntfy_url_iv" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "ntfy_url_tag" "bytea";
