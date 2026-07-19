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
