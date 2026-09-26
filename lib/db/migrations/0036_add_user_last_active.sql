ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
-- Start from when each account's app sign-ins were last used, so the list
-- isn't blank until everyone comes back.
UPDATE "users" SET "last_active_at" = t.last_used FROM (SELECT "user_id", max("last_used_at") AS last_used FROM "api_tokens" GROUP BY "user_id") t WHERE t."user_id" = "users"."id";
