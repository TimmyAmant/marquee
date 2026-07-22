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
