ALTER TABLE "people" ADD COLUMN "known_for_title_id" uuid;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "vote_count" integer;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_known_for_title_id_titles_id_fk" FOREIGN KEY ("known_for_title_id") REFERENCES "public"."titles"("id") ON DELETE set null ON UPDATE no action;