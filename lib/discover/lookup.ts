import { getMovieGenres, getNetworkDetails, getTvGenres, searchCompany, searchKeyword } from "@/lib/tmdb/client";
import { CURATED_NETWORK_IDS } from "@/lib/tmdb/curated-companies";
import type { DiscoverLookupResult } from "@/lib/api/types";
import { fail, type CoreResult } from "@/lib/core-result";

// Settings → Discover's search box when adding a row: TMDb keywords,
// companies (studios), networks and genres by name. TMDb has no network
// search, so networks come from the ones Discover already knows, or a
// network's TMDb number.

export const LOOKUP_TYPES = ["keyword", "company", "network", "genre"] as const;
export type LookupType = (typeof LOOKUP_TYPES)[number];

const LIMIT = 20;

function matches(name: string, query: string): boolean {
  return !query || name.toLowerCase().includes(query.toLowerCase());
}

export async function lookUpShelfSource(
  type: string,
  rawQuery: string,
  mediaType: string | null,
): Promise<CoreResult<{ results: DiscoverLookupResult[] }>> {
  if (!(LOOKUP_TYPES as readonly string[]).includes(type)) {
    return fail("invalid", `type is one of ${LOOKUP_TYPES.join(", ")}.`);
  }
  const query = rawQuery.trim().slice(0, 100);

  if (type === "genre") {
    if (mediaType !== "movie" && mediaType !== "tv") return fail("invalid", 'Genres need mediaType "movie" or "tv".');
    const { genres } = await (mediaType === "tv" ? getTvGenres() : getMovieGenres());
    return {
      ok: true,
      results: genres
        .filter((g) => matches(g.name, query))
        .map((g) => ({ tmdbId: g.id, name: g.name, logoPath: null, detail: null })),
    };
  }

  if (type === "network") {
    if (/^\d{1,9}$/.test(query)) {
      const network = await getNetworkDetails(Number(query)).catch(() => null);
      return {
        ok: true,
        results: network ? [{ tmdbId: network.id, name: network.name, logoPath: network.logo_path, detail: null }] : [],
      };
    }
    const known = await Promise.all(CURATED_NETWORK_IDS.map((id) => getNetworkDetails(id).catch(() => null)));
    return {
      ok: true,
      results: known
        .filter((n): n is NonNullable<typeof n> => n !== null && matches(n.name, query))
        .map((n) => ({ tmdbId: n.id, name: n.name, logoPath: n.logo_path, detail: null })),
    };
  }

  if (!query) return { ok: true, results: [] };

  if (type === "keyword") {
    const { results } = await searchKeyword(query);
    // The exact name first ("anime" before "anime inspired").
    const exact = results.filter((k) => k.name.toLowerCase() === query.toLowerCase());
    const rest = results.filter((k) => k.name.toLowerCase() !== query.toLowerCase());
    return {
      ok: true,
      results: [...exact, ...rest].slice(0, LIMIT).map((k) => ({ tmdbId: k.id, name: k.name, logoPath: null, detail: null })),
    };
  }

  const { results } = await searchCompany(query);
  return {
    ok: true,
    results: results.slice(0, LIMIT).map((c) => ({
      tmdbId: c.id,
      name: c.name,
      logoPath: c.logo_path,
      detail: c.origin_country || null,
    })),
  };
}
