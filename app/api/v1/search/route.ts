import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { invalid } from "@/lib/api/request";
import { loadPosterActionRules } from "@/lib/api/poster-action-rules";
import { searchCompanyDto, searchPersonDto, searchTitleDto } from "@/lib/api/search-dto";
import { loadSearchResults } from "@/lib/pages/search";
import type { SearchResults } from "@/lib/api/types";

/** The /search?q= results page: `sections` in the page's order — movies,
 * series, people, studios & networks — each ranked with its total, plus a
 * genre/keyword theme row, with status, favorites and the viewer's quick
 * action (lib/api/poster-actions.ts). `people`/`studios`/`titles` repeat
 * the sections the way apps before 0.54 read them. */
export const GET = withApi(async (request): Promise<SearchResults> => {
  const ctx = await requireApiUser(request);
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) throw invalid(msg("server.queryRequired"));
  await requireTmdbConfigured();

  const data = await loadSearchResults(await ctx.viewer(), query);
  const allTitles = [...data.movies.items, ...data.series.items, ...(data.theme?.items ?? [])];
  const rules = await loadPosterActionRules(ctx.user, allTitles, data.arrConfigured);
  const title = (card: (typeof allTitles)[number]) => searchTitleDto(rules, card);

  const movies = data.movies.items.map(title);
  const series = data.series.items.map(title);
  const people = data.people.items.map(searchPersonDto);
  const companies = data.companies.items.map(searchCompanyDto);

  return {
    query,
    people,
    studios: companies
      .filter((company) => company.kind === "studio")
      .map(({ kind: _kind, ...company }) => company),
    titles: [...movies, ...series],
    theme:
      data.theme && data.theme.items.length > 0
        ? { label: data.theme.label, items: data.theme.items.map(title), placement: data.theme.placement }
        : null,
    sections: {
      movies: { totalResults: data.movies.totalResults, totalPages: data.movies.totalPages, results: movies },
      series: { totalResults: data.series.totalResults, totalPages: data.series.totalPages, results: series },
      people: { totalResults: data.people.totalResults, totalPages: data.people.totalPages, results: people },
      studiosAndNetworks: {
        totalResults: data.companies.totalResults,
        totalPages: data.companies.totalPages,
        results: companies,
      },
    },
  };
});
