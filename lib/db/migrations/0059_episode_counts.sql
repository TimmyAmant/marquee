ALTER TABLE "arr_status_cache" ADD COLUMN "episodes_have" integer;--> statement-breakpoint
ALTER TABLE "arr_status_cache" ADD COLUMN "episodes_aired" integer;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "episodes_have" integer;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "episodes_have" integer;