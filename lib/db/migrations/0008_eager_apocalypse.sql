CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"poster_path" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_status_check" CHECK ("requests"."status" in ('pending','approved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin','member'));--> statement-breakpoint
-- One-off promotion: the very first account ever created (earliest
-- created_at) becomes admin, so existing installs land with exactly one
-- admin instead of everyone defaulting to "member". Only runs when no
-- admin exists yet, so it's a no-op on any later migration run.
UPDATE "users" SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
AND NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin');