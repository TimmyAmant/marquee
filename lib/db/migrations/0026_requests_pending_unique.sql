-- An install upgrading from before this index may already hold the very
-- duplicates it exists to prevent (a double-clicked Request). Keep the
-- earliest pending row per title so the index can be created; without this
-- the whole upgrade's migration batch rolls back and the container never
-- comes up.
DELETE FROM "requests" AS later
USING "requests" AS earlier
WHERE later."status" = 'pending'
  AND earlier."status" = 'pending'
  AND later."requested_by_user_id" = earlier."requested_by_user_id"
  AND later."media_type" = earlier."media_type"
  AND later."tmdb_id" = earlier."tmdb_id"
  AND (earlier."created_at" < later."created_at" OR (earlier."created_at" = later."created_at" AND earlier."id" < later."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "requests_pending_unique_idx" ON "requests" USING btree ("requested_by_user_id","media_type","tmdb_id") WHERE "requests"."status" = 'pending';
