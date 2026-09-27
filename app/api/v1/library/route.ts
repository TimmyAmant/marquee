import { libraryPageHandler } from "@/lib/api/routes/library";

/** The Library page: every title in Plex, Jellyfin, Sonarr and Radarr, filtered, sorted and paged. */
export const GET = libraryPageHandler;
