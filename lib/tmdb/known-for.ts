// The one title a person or a studio is best known for — the artwork behind
// their page's header (app/person/[id], app/company/[id]) and the "From …"
// link to it. Pure and dependency-free so the choice is unit tested
// directly; lib/tmdb/cache.ts runs it over the credits it already fetched.

export type KnownForCredit = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  name: string;
  backdropPath: string | null;
  voteCount: number | null;
  /** Billing order (movies; TMDb leaves it out for most TV credits). */
  order?: number | null;
  episodeCount?: number | null;
  character?: string | null;
  department?: string | null;
  job?: string | null;
  genreIds?: number[] | null;
};

// TMDb's TV genres for talk shows, news and reality: a guest spot on a late
// night show racks up episodes (and votes) without being anyone's role.
const NOT_A_ROLE_GENRES = new Set([10763, 10764, 10767]);

/** "Himself", "Self - Host", "Neil Patrick Harris (uncredited)"-style
 * appearances aren't a part anyone's known for. */
function isAppearance(credit: KnownForCredit, personName: string): boolean {
  const character = (credit.character ?? "").trim().toLowerCase();
  if (/^(self|himself|herself|themselves|themself)\b/.test(character)) return true;
  if (character.includes("(uncredited)")) return true;
  if (personName && character === personName.trim().toLowerCase()) return true;
  return (credit.genreIds ?? []).some((genre) => NOT_A_ROLE_GENRES.has(genre));
}

/** 2 = a lead (top-two billing in a film, a series regular across seasons),
 * 1 = main cast (top-four billing, a recurring run), 0 = anything smaller.
 * A lead always beats a supporting part however many more votes the latter
 * has — Neil Patrick Harris is Barney Stinson (208 episodes) before he's
 * Gone Girl's third-billed Desi. */
function castTier(credit: KnownForCredit): number {
  if (credit.mediaType === "tv") {
    const episodes = credit.episodeCount ?? 0;
    if (episodes >= 20) return 2;
    if (episodes >= 10) return 1;
    // A handful of TV credits carry billing order instead of a count.
    if (credit.episodeCount == null && credit.order != null && credit.order <= 1) return 1;
    return 0;
  }
  if (credit.order == null) return 0;
  if (credit.order <= 1) return 2;
  if (credit.order <= 3) return 1;
  return 0;
}

// The jobs that make a title someone's own in each crew department, so a
// director is known for what they directed rather than a film they only
// executive-produced.
const SIGNATURE_JOBS: Record<string, string[]> = {
  Directing: ["Director"],
  Writing: ["Creator", "Screenplay", "Writer", "Story", "Author", "Novel", "Teleplay"],
  Production: ["Producer", "Creator"],
  Camera: ["Director of Photography"],
  Editing: ["Editor"],
  Sound: ["Original Music Composer", "Music"],
  Art: ["Production Design", "Production Designer"],
  "Costume & Make-Up": ["Costume Design", "Costume Designer"],
  "Visual Effects": ["Visual Effects Supervisor"],
  Crew: [],
  Lighting: [],
};

function crewTier(credit: KnownForCredit, department: string): number {
  const signature = SIGNATURE_JOBS[department] ?? [];
  const isSignature = signature.length === 0 || signature.includes(credit.job ?? "");
  if (credit.mediaType === "tv") {
    const episodes = credit.episodeCount ?? 0;
    if (credit.job === "Creator") return 2;
    if (isSignature && episodes >= 20) return 2;
    if (episodes >= 10) return 1;
    return 0;
  }
  return isSignature ? 2 : 1;
}

// A show collects far fewer TMDb votes than a film of the same standing
// (Friends has about as many as We're the Millers), so a show's votes count
// this many times over when a film and a show compete.
const TV_VOTE_WEIGHT = 3;

function weightedVotes(credit: KnownForCredit): number {
  return (credit.voteCount ?? 0) * (credit.mediaType === "tv" ? TV_VOTE_WEIGHT : 1);
}

/** Most (weighted) votes first; ties broken by id (movies before shows) so
 * the same credits always pick the same title. */
function compareCandidates(a: KnownForCredit, b: KnownForCredit): number {
  return (
    weightedVotes(b) - weightedVotes(a) ||
    (a.mediaType === b.mediaType ? 0 : a.mediaType === "movie" ? -1 : 1) ||
    a.tmdbId - b.tmdbId
  );
}

function best(candidates: { credit: KnownForCredit; tier: number }[]): KnownForCredit | null {
  // Only the top tier that has a backdrop at all — a lead with no artwork
  // lets a main-cast part with some through, never a bit part.
  for (const tier of [2, 1]) {
    const pool = candidates
      .filter((c) => c.tier === tier && c.credit.backdropPath)
      .map((c) => c.credit)
      .sort(compareCandidates);
    if (pool.length > 0) return pool[0];
  }
  return null;
}

/**
 * The title a person is best known for: among the credits of the department
 * they're known for (TMDb's known_for_department — acting unless they're a
 * director, writer, …), the leads first, then main parts, and within those
 * the one with the most TMDb votes (a show's weighted up, see TV_VOTE_WEIGHT). Only titles with a backdrop count, since
 * the backdrop is what it's for; null when none qualifies (the page keeps its
 * plain header).
 */
export function pickPersonKnownFor(input: {
  personName: string;
  knownForDepartment: string | null | undefined;
  cast: KnownForCredit[];
  crew: KnownForCredit[];
}): KnownForCredit | null {
  const department = input.knownForDepartment || "Acting";
  const fromCast = () =>
    best(
      input.cast
        .filter((credit) => !isAppearance(credit, input.personName))
        .map((credit) => ({ credit, tier: castTier(credit) })),
    );
  const fromCrew = () =>
    best(
      input.crew
        // A show's creator is credited in a "Creator" department of its own.
        .filter((credit) => credit.department === department || credit.job === "Creator")
        .map((credit) => ({ credit, tier: crewTier(credit, department) })),
    );
  return department === "Acting" ? fromCast() : (fromCrew() ?? fromCast());
}

/** A studio's or network's best-known title: the most-voted one in its
 * catalog that has a backdrop. */
export function pickCatalogKnownFor<
  T extends { mediaType: "movie" | "tv"; tmdbId: number; backdropPath: string | null; voteCount: number | null },
>(catalog: T[]): T | null {
  const pool = catalog.filter((title) => title.backdropPath && (title.voteCount ?? 0) > 0);
  if (pool.length === 0) return null;
  return [...pool].sort(
    (a, b) =>
      (b.voteCount ?? 0) - (a.voteCount ?? 0) ||
      (a.mediaType === b.mediaType ? 0 : a.mediaType === "movie" ? -1 : 1) ||
      a.tmdbId - b.tmdbId,
  )[0];
}
