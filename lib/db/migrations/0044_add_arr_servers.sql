CREATE TABLE "arr_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_enc" "bytea" NOT NULL,
	"api_key_iv" "bytea" NOT NULL,
	"api_key_tag" "bytea" NOT NULL,
	"is_4k" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"quality_profile_id" integer,
	"root_folder_path" text,
	"tags" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"series_type" text,
	"season_folders" boolean,
	"anime_quality_profile_id" integer,
	"anime_root_folder_path" text,
	"anime_tags" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"webhook_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arr_servers_kind_check" CHECK ("arr_servers"."kind" in ('sonarr','radarr')),
	CONSTRAINT "arr_servers_series_type_check" CHECK ("arr_servers"."series_type" is null or "arr_servers"."series_type" in ('standard','daily','anime'))
);
--> statement-breakpoint
ALTER TABLE "arr_status_cache" ADD COLUMN "server_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "arr_server_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "arr_server_name" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "arr_quality_profile_id" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "arr_root_folder_path" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "arr_tags" integer[];--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "arr_series_type" text;--> statement-breakpoint
ALTER TABLE "arr_servers" ADD CONSTRAINT "arr_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arr_servers_user_kind_idx" ON "arr_servers" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "arr_servers_one_default_idx" ON "arr_servers" USING btree ("user_id","kind","is_4k") WHERE "arr_servers"."is_default";--> statement-breakpoint
ALTER TABLE "arr_status_cache" ADD CONSTRAINT "arr_status_cache_server_id_arr_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."arr_servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_arr_server_id_arr_servers_id_fk" FOREIGN KEY ("arr_server_id") REFERENCES "public"."arr_servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Move the four fixed Sonarr/Radarr connections (0.37's sonarr, radarr,
-- sonarr4k, radarr4k) into arr_servers as the default server of their kind
-- and 4K-ness, keeping their encrypted key, defaults and behaviour: Sonarr
-- keeps adding shows as "standard" without season folders, which is what
-- the old add did (it sent Sonarr's lookup result as it came).
INSERT INTO "arr_servers" (
	"user_id", "kind", "name", "base_url", "api_key_enc", "api_key_iv", "api_key_tag",
	"is_4k", "is_default", "quality_profile_id", "root_folder_path",
	"series_type", "season_folders", "webhook_secret", "created_at", "updated_at"
)
SELECT
	"user_id",
	CASE WHEN "provider" IN ('sonarr', 'sonarr4k') THEN 'sonarr' ELSE 'radarr' END,
	CASE "provider"
		WHEN 'sonarr' THEN 'Sonarr'
		WHEN 'radarr' THEN 'Radarr'
		WHEN 'sonarr4k' THEN '4K Sonarr'
		ELSE '4K Radarr'
	END,
	"base_url", "api_key_enc", "api_key_iv", "api_key_tag",
	"provider" IN ('sonarr4k', 'radarr4k'),
	true,
	"quality_profile_id", "root_folder_path",
	CASE WHEN "provider" IN ('sonarr', 'sonarr4k') THEN 'standard' ELSE NULL END,
	CASE WHEN "provider" IN ('sonarr', 'sonarr4k') THEN false ELSE NULL END,
	replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
	"created_at", now()
FROM "integration_credentials"
WHERE "provider" IN ('sonarr', 'radarr', 'sonarr4k', 'radarr4k')
	AND "base_url" IS NOT NULL
	AND "api_key_enc" IS NOT NULL
	AND "api_key_iv" IS NOT NULL
	AND "api_key_tag" IS NOT NULL;
--> statement-breakpoint
UPDATE "arr_status_cache" AS "c"
SET "server_id" = "s"."id"
FROM "arr_servers" AS "s"
WHERE "s"."user_id" = "c"."user_id"
	AND "s"."kind" = "c"."provider"
	AND "s"."is_4k" = false
	AND "s"."is_default";
--> statement-breakpoint
DELETE FROM "integration_credentials" WHERE "provider" IN ('sonarr', 'radarr', 'sonarr4k', 'radarr4k');
