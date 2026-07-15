CREATE TABLE "arr_status_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" integer NOT NULL,
	"arr_id" integer,
	"status" text,
	"monitored" boolean,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arr_status_cache_user_id_provider_external_id_unique" UNIQUE("user_id","provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_path" text,
	"origin_country" text,
	"parent_company_tmdb_id" integer,
	"raw_tmdb" jsonb,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "company_titles" (
	"company_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	CONSTRAINT "company_titles_company_id_title_id_pk" PRIMARY KEY("company_id","title_id")
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"department" text NOT NULL,
	"character_name" text,
	"episode_count" integer,
	"order" integer,
	CONSTRAINT "credits_person_id_title_id_department_character_name_unique" UNIQUE("person_id","title_id","department","character_name")
);
--> statement-breakpoint
CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"base_url" text,
	"api_key_enc" "bytea",
	"api_key_iv" "bytea",
	"api_key_tag" "bytea",
	"plex_auth_token_enc" "bytea",
	"plex_auth_token_iv" "bytea",
	"plex_auth_token_tag" "bytea",
	"plex_client_id" text,
	"quality_profile_id" integer,
	"root_folder_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_credentials_user_id_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"also_known_as" text[],
	"biography" text,
	"birthday" date,
	"deathday" date,
	"place_of_birth" text,
	"profile_path" text,
	"raw_tmdb" jsonb,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "plex_library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plex_server_id" uuid NOT NULL,
	"rating_key" text NOT NULL,
	"media_type" text NOT NULL,
	"guid" text,
	"tmdb_id" integer,
	"tvdb_id" integer,
	"imdb_id" text,
	"title" text,
	"added_at" timestamp with time zone,
	CONSTRAINT "plex_library_items_plex_server_id_rating_key_unique" UNIQUE("plex_server_id","rating_key")
);
--> statement-breakpoint
CREATE TABLE "plex_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"machine_identifier" text NOT NULL,
	"name" text,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "plex_servers_user_id_machine_identifier_unique" UNIQUE("user_id","machine_identifier")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"tvdb_id" integer,
	"imdb_id" text,
	"name" text NOT NULL,
	"overview" text,
	"poster_path" text,
	"backdrop_path" text,
	"release_date" date,
	"first_air_date" date,
	"status" text,
	"raw_tmdb" jsonb,
	"raw_tvdb" jsonb,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titles_media_type_tmdb_id_unique" UNIQUE("media_type","tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "arr_status_cache" ADD CONSTRAINT "arr_status_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_titles" ADD CONSTRAINT "company_titles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_titles" ADD CONSTRAINT "company_titles_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD CONSTRAINT "plex_library_items_plex_server_id_plex_servers_id_fk" FOREIGN KEY ("plex_server_id") REFERENCES "public"."plex_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plex_servers" ADD CONSTRAINT "plex_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plex_items_tmdb_idx" ON "plex_library_items" USING btree ("tmdb_id");--> statement-breakpoint
CREATE INDEX "plex_items_tvdb_idx" ON "plex_library_items" USING btree ("tvdb_id");--> statement-breakpoint
CREATE INDEX "titles_tvdb_id_idx" ON "titles" USING btree ("tvdb_id");