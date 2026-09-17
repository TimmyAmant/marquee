import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { invalid } from "@/lib/api/request";
import { statusKey, titleCard, yearOf } from "@/lib/api/mappers";
import { loadSearchResults } from "@/lib/pages/search";
import type { SearchResults } from "@/lib/api/types";
import type { MediaType } from "@/lib/db/schema";

/** The /search?q= results page: people, studios, titles, and a genre/keyword
 * theme row, with status, favorites and quick-add eligibility. */
export const GET = withApi(async (request): Promise<SearchResults> => {
  const ctx = await requireApiUser(request);
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) throw invalid('"q" is required.');
  await requireTmdbConfigured();

  const data = await loadSearchResults(await ctx.viewer(), query);

  const card = (base: { mediaType: MediaType; tmdbId: number; name: string; posterPath: string | null; year: string | null }) => {
    const status = data.statusMap.get(statusKey(base.mediaType, base.tmdbId)) ?? null;
    return titleCard(base, {
      status,
      favorited: data.favoritedTitle(base.mediaType, base.tmdbId),
      canQuickAdd: data.arrConfigured[base.mediaType] && !status,
    });
  };

  return {
    query,
    people: data.people.map((person) => ({
      tmdbId: person.id,
      name: person.name ?? "",
      profilePath: person.profile_path ?? null,
      knownForDepartment: person.known_for_department ?? null,
      favorited: data.favoritedPersonIds.has(person.id),
    })),
    studios: data.companyResults.map((company) => ({
      tmdbId: company.tmdbId,
      name: company.name,
      logoPath: company.logoPath,
      favorited: data.favoritedCompanyIds.has(company.tmdbId),
    })),
    titles: data.titleResults.map((title) =>
      card({
        mediaType: title.media_type as MediaType,
        tmdbId: title.id,
        name: title.title || title.name || "",
        posterPath: title.poster_path ?? null,
        year: yearOf(title.release_date || title.first_air_date),
      }),
    ),
    theme:
      data.themeItems.length > 0 && data.themeLabel
        ? { label: data.themeLabel, items: data.themeItems.map((item) => card(item)) }
        : null,
  };
});
