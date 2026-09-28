CREATE TABLE "title_translations" (
	"title_id" uuid NOT NULL,
	"language" text NOT NULL,
	"name" text,
	"overview" text,
	"tagline" text,
	"poster_path" text,
	"details" jsonb,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_translations_title_id_language_pk" PRIMARY KEY("title_id","language")
);
--> statement-breakpoint
ALTER TABLE "title_translations" ADD CONSTRAINT "title_translations_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;