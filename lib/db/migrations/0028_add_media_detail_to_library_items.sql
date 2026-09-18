ALTER TABLE "plex_library_items" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "video_codec" text;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "dynamic_range" text;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "audio_codec" text;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "audio_channels" integer;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "container" text;--> statement-breakpoint
ALTER TABLE "plex_library_items" ADD COLUMN "bitrate_kbps" integer;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "video_codec" text;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "dynamic_range" text;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "audio_codec" text;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "audio_channels" integer;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "container" text;--> statement-breakpoint
ALTER TABLE "jellyfin_library_items" ADD COLUMN "bitrate_kbps" integer;
