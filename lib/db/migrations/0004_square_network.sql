CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_access_token_enc" "bytea",
	"tmdb_access_token_iv" "bytea",
	"tmdb_access_token_tag" "bytea",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
