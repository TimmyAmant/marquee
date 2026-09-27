CREATE TABLE "title_ratings" (
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"imdb_id" text,
	"imdb_rating_tenths" integer,
	"imdb_votes" integer,
	"rotten_tomatoes_critics" integer,
	"metacritic" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_ratings_media_type_tmdb_id_pk" PRIMARY KEY("media_type","tmdb_id")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "omdb_api_key_enc" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "omdb_api_key_iv" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "omdb_api_key_tag" "bytea";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "streaming_region" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "discover_region" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "discover_language" text;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD COLUMN "public_url" text;