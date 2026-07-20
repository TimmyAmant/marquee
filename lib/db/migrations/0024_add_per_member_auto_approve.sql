ALTER TABLE "users" ADD COLUMN "auto_approve_movies" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_approve_tv" boolean DEFAULT false NOT NULL;
