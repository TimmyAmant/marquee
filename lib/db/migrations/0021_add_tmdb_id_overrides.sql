CREATE TABLE "tmdb_id_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"wrong_tmdb_id" integer NOT NULL,
	"correct_tmdb_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_id_overrides_user_id_media_type_wrong_tmdb_id_unique" UNIQUE("user_id","media_type","wrong_tmdb_id")
);
--> statement-breakpoint
ALTER TABLE "tmdb_id_overrides" ADD CONSTRAINT "tmdb_id_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;