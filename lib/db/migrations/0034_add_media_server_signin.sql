ALTER TABLE "app_settings" ADD COLUMN "media_server_signup" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plex_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "jellyfin_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plex_user_id_unique" UNIQUE("plex_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_jellyfin_user_id_unique" UNIQUE("jellyfin_user_id");