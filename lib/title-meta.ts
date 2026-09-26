/** "2001–2011" for an ended show, "2026" for a movie or a show missing one
 * end of the range, null if neither year is known. Pulled out of the title
 * page as a standalone function so this specific piece of logic — which
 * previously rendered the literal string "null–2020" when a TV show had an
 * end date but no start date on TMDb — can be unit tested directly. */
export function computeYearRange(startYear: string | null, endYear: string | null): string | null {
  if (startYear && endYear && endYear !== startYear) return `${startYear}–${endYear}`;
  return startYear ?? endYear;
}

/** TMDb's own wording for an ongoing show ("Returning Series") is longer
 * than the "Continuing"/"Ended" convention Sonarr and other *arr apps use —
 * relabel just that one case, pass everything else through as-is. */
export function relabelTvStatus(status: string | null): string | null {
  return status === "Returning Series" ? "Continuing" : status;
}

export type CreditEntry = { role: string; name: string };

/** Director + Screenplay/Writer credits for a movie, deduped by person (a
 * writer credited for both "Screenplay" and "Story" would otherwise appear
 * twice) and capped so the credits grid never sprawls past a couple of
 * rows. */
export function extractMovieCredits(
  crew: { id: number; name: string; job: string; department: string }[],
): CreditEntry[] {
  const seen = new Set<number>();
  const entries: CreditEntry[] = [];

  for (const member of crew) {
    if (member.job !== "Director" || seen.has(member.id)) continue;
    entries.push({ role: "Director", name: member.name });
    seen.add(member.id);
  }
  for (const member of crew) {
    if (seen.has(member.id)) continue;
    if (member.department === "Writing" && (member.job === "Screenplay" || member.job === "Writer")) {
      entries.push({ role: member.job, name: member.name });
      seen.add(member.id);
    }
  }

  return entries.slice(0, 6);
}

export type ExternalLinkIds = {
  imdbId: string | null;
  facebookId: string | null;
  instagramId: string | null;
  twitterId: string | null;
  tvdbId?: number | null;
  tvdbMediaType?: "series" | "movies";
};

/** The title page's external link buttons (IMDb, TheTVDB, socials), in
 * display order. The trailer button is separate. */
export function buildExternalLinks(links: ExternalLinkIds): { label: string; href: string }[] {
  const items: { label: string; href: string }[] = [];

  if (links.imdbId) {
    items.push({ label: "IMDb", href: `https://www.imdb.com/title/${links.imdbId}` });
  }
  if (links.tvdbId) {
    items.push({
      label: "TheTVDB",
      href: `https://www.thetvdb.com/dereferrer/${links.tvdbMediaType ?? "series"}/${links.tvdbId}`,
    });
  }
  if (links.instagramId) {
    items.push({ label: "Instagram", href: `https://www.instagram.com/${links.instagramId}` });
  }
  if (links.twitterId) {
    items.push({ label: "X / Twitter", href: `https://x.com/${links.twitterId}` });
  }
  if (links.facebookId) {
    items.push({ label: "Facebook", href: `https://www.facebook.com/${links.facebookId}` });
  }

  return items;
}

/** The title page's Cast row: billing order, top 20. */
export function topBilledCast<T extends { order: number }>(cast: T[]): T[] {
  return [...cast].sort((a, b) => a.order - b.order).slice(0, 20);
}

/** The Episodes accordion's seasons: only ones with episodes, newest season
 * first (matching Sonarr's own series-detail page). */
export function seasonsNewestFirst<T extends { season_number: number; episode_count: number }>(seasons: T[]): T[] {
  return [...seasons].filter((s) => s.episode_count > 0).sort((a, b) => b.season_number - a.season_number);
}

/** The franchise row's "Add all N missing" set: titles not in the library at
 * all whose Sonarr/Radarr is fully configured — admin-only, empty otherwise. */
export function franchiseMissingItems<T extends { mediaType: "movie" | "tv"; tmdbId: number }>(
  items: T[],
  statusKeys: { has(key: string): boolean },
  arrConfigured: { movie: boolean; tv: boolean } | undefined,
  isAdmin: boolean | undefined,
): { mediaType: "movie" | "tv"; tmdbId: number }[] {
  if (isAdmin !== true) return [];
  return items
    .filter((item) => !statusKeys.has(`${item.mediaType}:${item.tmdbId}`) && arrConfigured?.[item.mediaType])
    .map((item) => ({ mediaType: item.mediaType, tmdbId: item.tmdbId }));
}

/** The franchise row's "Request all N missing" set for a household member
 * (plain or trusted): exactly the titles whose poster shows a Request button
 * — not in the library at all, not already asked for by this viewer, not on
 * the admin's blocklist. Empty for the admin (who gets "Add all") and when
 * signed out. A keyword block is left to createRequest's refusal, as the
 * poster buttons do. */
export function franchiseRequestableItems<T extends { mediaType: "movie" | "tv"; tmdbId: number }>(
  items: T[],
  statusKeys: { has(key: string): boolean },
  requestedKeys: { has(key: string): boolean } | undefined,
  blockedKeys: { has(key: string): boolean } | undefined,
  isAdmin: boolean | undefined,
): { mediaType: "movie" | "tv"; tmdbId: number }[] {
  if (isAdmin !== false) return [];
  const seen = new Set<string>();
  const result: { mediaType: "movie" | "tv"; tmdbId: number }[] = [];
  for (const item of items) {
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (seen.has(key) || statusKeys.has(key) || requestedKeys?.has(key) || blockedKeys?.has(key)) continue;
    seen.add(key);
    result.push({ mediaType: item.mediaType, tmdbId: item.tmdbId });
  }
  return result;
}

/** Creator + Executive Producer credits for a TV show — same dedup/cap
 * approach as extractMovieCredits, see there for why. */
export function extractTvCredits(
  createdBy: { id: number; name: string }[],
  crew: { id: number; name: string; job: string }[],
): CreditEntry[] {
  const seen = new Set<number>();
  const entries: CreditEntry[] = [];

  for (const person of createdBy) {
    if (seen.has(person.id)) continue;
    entries.push({ role: "Creator", name: person.name });
    seen.add(person.id);
  }
  for (const member of crew) {
    if (member.job !== "Executive Producer" || seen.has(member.id)) continue;
    entries.push({ role: "Executive Producer", name: member.name });
    seen.add(member.id);
  }

  return entries.slice(0, 6);
}
