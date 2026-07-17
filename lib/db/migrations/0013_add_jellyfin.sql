-- Widen the provider check to allow Jellyfin as a second, independent
-- media-server integration alongside Plex — reuses the generic
-- baseUrl/apiKeyEnc columns on integration_credentials (Jellyfin auths via
-- a plain server URL + API key, no OAuth token like Plex needs).
ALTER TABLE "integration_credentials" DROP CONSTRAINT "integration_credentials_provider_check";--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_provider_check" CHECK ("integration_credentials"."provider" in ('sonarr','radarr','plex','jellyfin'));--> statement-breakpoint

CREATE TABLE "jellyfin_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"server_id" text NOT NULL,
	"name" text,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "jellyfin_servers_user_id_server_id_unique" UNIQUE("user_id","server_id")
);--> statement-breakpoint

CREATE TABLE "jellyfin_library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jellyfin_server_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer,
	"tvdb_id" integer,
	"imdb_id" text,
	"title" text,
	"added_at" timestamp with time zone,
	"size_bytes" bigint,
	"file_path" text,
	CONSTRAINT "jellyfin_library_items_jellyfin_server_id_item_id_unique" UNIQUE("jellyfin_server_id","item_id")
);--> statement-breakpoint

ALTER TABLE "jellyfin_servers" ADD CONSTRAINT "jellyfin_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD CONSTRAINT "jellyfin_library_items_server_id_fk" FOREIGN KEY ("jellyfin_server_id") REFERENCES "public"."jellyfin_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "jellyfin_items_tmdb_idx" ON "jellyfin_library_items" USING btree ("tmdb_id");--> statement-breakpoint
CREATE INDEX "jellyfin_items_tvdb_idx" ON "jellyfin_library_items" USING btree ("tvdb_id");