ALTER TABLE "arr_status_cache" ADD COLUMN "quality_cutoff_not_met" boolean;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "view_count" integer;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "last_viewed_at" timestamp with time zone;