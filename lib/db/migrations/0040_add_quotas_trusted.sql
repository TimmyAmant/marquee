ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "movie_quota_limit" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "movie_quota_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tv_quota_limit" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tv_quota_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin','member','trusted'));