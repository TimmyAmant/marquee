import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { titles } from "@/lib/db/schema";
import { findByTvdbId } from "@/lib/tmdb/client";

export async function resolveTmdbIdFromTvdbId(tvdbId: number): Promise<number | null> {
  const [existing] = await db
    .select({ tmdbId: titles.tmdbId })
    .from(titles)
    .where(and(eq(titles.mediaType, "tv"), eq(titles.tvdbId, tvdbId)))
    .limit(1);
  if (existing) return existing.tmdbId;

  const result = await findByTvdbId(tvdbId).catch(() => null);
  return result?.tv_results?.[0]?.id ?? null;
}
