CREATE TABLE "plex_watchlist_items" (
	"user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"outcome" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plex_watchlist_items_user_id_media_type_tmdb_id_pk" PRIMARY KEY("user_id","media_type","tmdb_id"),
	CONSTRAINT "plex_watchlist_items_outcome_check" CHECK ("plex_watchlist_items"."outcome" in ('requested','skipped'))
);
--> statement-breakpoint
CREATE TABLE "plex_watchlists" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plex_user_id" text NOT NULL,
	"auth_token_enc" "bytea",
	"auth_token_iv" "bytea",
	"auth_token_tag" "bytea",
	"client_id" text NOT NULL,
	"sync_movies" boolean DEFAULT true NOT NULL,
	"sync_tv" boolean DEFAULT true NOT NULL,
	"etag" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plex_watchlist_items" ADD CONSTRAINT "plex_watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plex_watchlist_items" ADD CONSTRAINT "plex_watchlist_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plex_watchlists" ADD CONSTRAINT "plex_watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;