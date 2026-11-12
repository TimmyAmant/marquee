// What a credit on a person's page is: a part they acted ("acting"), an
// appearance as themselves ("self": documentaries, talk shows, stand-up,
// archive footage), or work behind the camera ("crew"). The page's Roles
// filter defaults to acting, so someone looking up an actor's films isn't
// handed their interviews and biographies to download. Pure, so it's unit
// tested directly; lib/tmdb/cache.ts saves the answer with each credit.

export type CreditKind = "acting" | "self" | "crew";

/** The Roles filter: one kind, or everything. */
export type CreditFilter = CreditKind | "all";

export const CREDIT_FILTERS: CreditFilter[] = ["acting", "self", "crew", "all"];

const DOCUMENTARY = 99;
const MUSIC = 10402;
const COMEDY = 35;
const TV_MOVIE = 10770;
// TMDb's TV genres for news, reality and talk shows.
const UNSCRIPTED_TV = new Set([10763, 10764, 10767]);

/** "Self", "Himself", "Self - Host", "Herself (archive footage)". */
const SELF_CHARACTER = /^(self|himself|herself|themselves|themself|yourself)\b/;

export type CastCreditInput = {
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  character?: string | null;
  genre_ids?: number[] | null;
};

/**
 * Whether a cast credit is an appearance as themselves rather than a part.
 * A documentary or an unscripted show is always one, whatever the character.
 * Playing yourself in a scripted film is still acting: TMDb names those
 * parts after the person ("Bill Murray" in Zombieland), which counts as a
 * part here, and a "Himself" credit counts too when the film is a scripted
 * feature (Michael Jordan in Space Jam) — but not a concert film, TV movie
 * (award shows), comedy-only special (stand-up) or a title named after them.
 */
export function isSelfAppearance(item: CastCreditInput, personName: string): boolean {
  const genres = item.genre_ids ?? [];
  if (genres.includes(DOCUMENTARY)) return true;
  if (item.media_type === "tv" && genres.some((genre) => UNSCRIPTED_TV.has(genre))) return true;

  const character = (item.character ?? "").trim().toLowerCase();
  if (character.includes("archive footage")) return true;
  if (!SELF_CHARACTER.test(character)) return false;

  // "Himself" from here on: a part only in a scripted feature.
  if (item.media_type === "tv") return true;
  if (genres.length === 0) return true;
  if (genres.includes(MUSIC) || genres.includes(TV_MOVIE)) return true;
  if (genres.length === 1 && genres[0] === COMEDY) return true;
  const title = (item.title || item.name || "").toLowerCase();
  const name = personName.trim().toLowerCase();
  if (name && title.includes(name)) return true;
  return false;
}

/** Where a person's page opens its Roles filter: acting for an actor,
 * behind the camera for a director, writer, …; everything when that
 * leaves nothing to show. */
export function defaultCreditFilter(
  knownForDepartment: string | null | undefined,
  kinds: CreditKind[][],
): CreditFilter {
  const preferred: CreditKind = !knownForDepartment || knownForDepartment === "Acting" ? "acting" : "crew";
  if (kinds.some((entry) => entry.includes(preferred))) return preferred;
  if (kinds.some((entry) => entry.includes("acting"))) return "acting";
  return "all";
}

export function matchesCreditFilter(kinds: CreditKind[] | undefined, filter: CreditFilter): boolean {
  if (filter === "all" || !kinds) return true;
  return kinds.includes(filter);
}
