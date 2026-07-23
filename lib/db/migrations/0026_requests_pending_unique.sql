CREATE UNIQUE INDEX "requests_pending_unique_idx" ON "requests" USING btree ("requested_by_user_id","media_type","tmdb_id") WHERE "requests"."status" = 'pending';
