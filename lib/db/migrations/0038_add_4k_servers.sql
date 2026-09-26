ALTER TABLE "integration_credentials" DROP CONSTRAINT "integration_credentials_provider_check";--> statement-breakpoint
DROP INDEX "requests_pending_unique_idx";--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "is_4k" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "requests_pending_unique_idx" ON "requests" USING btree ("requested_by_user_id","media_type","tmdb_id","is_4k") WHERE "requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_provider_check" CHECK ("integration_credentials"."provider" in ('sonarr','radarr','plex','jellyfin','sonarr4k','radarr4k'));