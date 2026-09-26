CREATE TABLE "discover_shelves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"built_in" text,
	"kind" text NOT NULL,
	"title" text,
	"source" jsonb,
	"position" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trakt_sync_items" (
	"user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"outcome" text NOT NULL,
	"sync_id" uuid,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trakt_sync_items_user_id_media_type_tmdb_id_pk" PRIMARY KEY("user_id","media_type","tmdb_id"),
	CONSTRAINT "trakt_sync_items_outcome_check" CHECK ("trakt_sync_items"."outcome" in ('requested','skipped','existing'))
);
--> statement-breakpoint
CREATE TABLE "trakt_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"username" text NOT NULL,
	"slug" text DEFAULT '' NOT NULL,
	"sync_movies" boolean DEFAULT true NOT NULL,
	"sync_tv" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trakt_syncs_kind_check" CHECK ("trakt_syncs"."kind" in ('watchlist','list'))
);
--> statement-breakpoint
ALTER TABLE "trakt_sync_items" ADD CONSTRAINT "trakt_sync_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trakt_sync_items" ADD CONSTRAINT "trakt_sync_items_sync_id_trakt_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."trakt_syncs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trakt_sync_items" ADD CONSTRAINT "trakt_sync_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trakt_syncs" ADD CONSTRAINT "trakt_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discover_shelves_built_in_idx" ON "discover_shelves" USING btree ("built_in");--> statement-breakpoint
CREATE UNIQUE INDEX "trakt_syncs_user_list_idx" ON "trakt_syncs" USING btree ("user_id","kind","username","slug");