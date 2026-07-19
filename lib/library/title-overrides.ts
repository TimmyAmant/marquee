import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tmdbIdOverrides } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";

/**
 * Every Plex/Jellyfin/Sonarr/Radarr sync re-derives a title's tmdbId fresh
 * from that source's own external-id data on every run — see the comment on
 * the tmdbIdOverrides table in lib/db/schema.ts. Every sync loop should call
 * this right after resolving a tmdbId from its own source and use the
 * returned value (falling back to the original) instead of trusting the
 * freshly-resolved one directly.
 */
export async function applyTmdbIdOverride(
  userId: string,
  mediaType: MediaType,
  resolvedTmdbId: number,
): Promise<number> {
  const [row] = await db
    .select({ correctTmdbId: tmdbIdOverrides.correctTmdbId })
    .from(tmdbIdOverrides)
    .where(
      and(
        eq(tmdbIdOverrides.userId, userId),
        eq(tmdbIdOverrides.mediaType, mediaType),
        eq(tmdbIdOverrides.wrongTmdbId, resolvedTmdbId),
      ),
    )
    .limit(1);
  return row?.correctTmdbId ?? resolvedTmdbId;
}
