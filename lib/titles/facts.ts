// The title page's facts panel beyond what TMDb's summary fields give:
// release dates by kind for a region, money, the original title — pure
// reads of the raw TMDb details (lib/tmdb/client.ts), unit tested.

import type { TmdbMovieDetails, TmdbReleaseDates, TmdbTvDetails, TmdbWatchProviders } from "@/lib/tmdb/client";

/** TMDb's release types (release_dates append). */
export const RELEASE_TYPE = { premiere: 1, theatricalLimited: 2, theatrical: 3, digital: 4, physical: 5, tv: 6 } as const;

export type ReleaseDates = {
  /** The region the dates are for — the one asked for, or US when it has
   * none, or the first TMDb has. */
  region: string;
  theatrical: string | null;
  digital: string | null;
  physical: string | null;
};

const day = (value: string) => value.slice(0, 10);

/** A movie's theatrical (wide, else limited), digital and physical release
 * days in `region` — the earliest of each kind. Null when TMDb has no
 * release dates at all. */
export function releaseDatesFor(dates: TmdbReleaseDates | undefined, region: string): ReleaseDates | null {
  const results = dates?.results ?? [];
  if (results.length === 0) return null;
  const entry =
    results.find((r) => r.iso_3166_1 === region.toUpperCase()) ??
    results.find((r) => r.iso_3166_1 === "US") ??
    results[0];
  const earliest = (...types: number[]): string | null => {
    const days = entry.release_dates
      .filter((r) => types.includes(r.type) && r.release_date)
      .map((r) => day(r.release_date))
      .sort();
    return days[0] ?? null;
  };
  return {
    region: entry.iso_3166_1,
    theatrical: earliest(RELEASE_TYPE.theatrical) ?? earliest(RELEASE_TYPE.theatricalLimited),
    digital: earliest(RELEASE_TYPE.digital),
    physical: earliest(RELEASE_TYPE.physical),
  };
}

/** TMDb's 0 means unknown. */
export function moneyOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** The original title, only when it isn't the one shown. */
export function originalTitleOf(type: "movie" | "tv", raw: TmdbMovieDetails | TmdbTvDetails | null, shown: string): string | null {
  const original = type === "movie" ? (raw as TmdbMovieDetails | null)?.original_title : (raw as TmdbTvDetails | null)?.original_name;
  return original && original.trim() && original.trim() !== shown.trim() ? original.trim() : null;
}

export type WatchProvider = { providerId: number; name: string; logoPath: string | null };

/** An https address as given, or null: TMDb's watch link becomes a link on
 * the title page, so nothing else (a javascript: URL, plain http) gets
 * through. */
export function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value.trim()).protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

/** "Currently streaming on": the subscription services in `region`, plus
 * TMDb's (JustWatch) page for the title there. Empty when none. */
export function streamingProvidersFor(
  providers: TmdbWatchProviders | undefined,
  region: string,
): { region: string; providers: WatchProvider[]; link: string | null } {
  const entry = providers?.results?.[region.toUpperCase()];
  const seen = new Set<number>();
  const list = (entry?.flatrate ?? [])
    .filter((p) => (seen.has(p.provider_id) ? false : (seen.add(p.provider_id), true)))
    .map((p) => ({ providerId: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }));
  return { region: region.toUpperCase(), providers: list, link: httpsUrlOrNull(entry?.link) };
}
