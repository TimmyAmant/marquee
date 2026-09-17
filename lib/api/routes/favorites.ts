import { parseFavoriteEntityType, parseIdSegment } from "@/lib/api/request";
import type { FavoriteEntityType } from "@/lib/db/schema";

export type FavoriteParams = { entityType: string; tmdbId: string };

export function parseFavoriteParams(params: FavoriteParams): { entityType: FavoriteEntityType; tmdbId: number } {
  return {
    entityType: parseFavoriteEntityType(params.entityType),
    tmdbId: parseIdSegment(params.tmdbId, "TMDb id"),
  };
}
