import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { invalid, optionalBoolean, readJsonBody } from "@/lib/api/request";
import { pickSurprise } from "@/lib/discover/surprise";
import type { SurprisePick } from "@/lib/api/types";

function optionalPositiveInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw invalid(`"${key}" must be a positive integer.`);
  }
  return value;
}

/** The Movies/Series "🎲 Surprise me" button: one random title for the given
 * filters, re-rolled a few times to skip owned titles when hideOwned is on. */
export const POST = withApi(async (request): Promise<SurprisePick> => {
  const ctx = await requireApiUser(request);

  const body = await readJsonBody(request);
  const displayType = body.type ?? "all";
  if (displayType !== "movie" && displayType !== "tv" && displayType !== "all") {
    throw invalid(`"type" must be "movie", "tv" or "all".`);
  }
  const params = {
    displayType,
    genreId: optionalPositiveInt(body, "genreId"),
    year: optionalPositiveInt(body, "year"),
    hideOwned: optionalBoolean(body, "hideOwned") ?? true,
  } as const;
  await requireTmdbConfigured();

  const { mediaType, tmdbId } = unwrap(await pickSurprise(await ctx.viewer(), params));
  return { mediaType, tmdbId };
});
