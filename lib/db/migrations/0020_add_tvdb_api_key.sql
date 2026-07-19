ALTER TABLE "app_settings" ADD COLUMN "tvdb_api_key_enc" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tvdb_api_key_iv" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tvdb_api_key_tag" "bytea";