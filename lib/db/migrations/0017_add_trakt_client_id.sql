ALTER TABLE "app_settings" ADD COLUMN "trakt_client_id_enc" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "trakt_client_id_iv" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "trakt_client_id_tag" "bytea";