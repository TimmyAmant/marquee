import { describe, expect, it } from "vitest";
import { pickCatalogKnownFor, pickPersonKnownFor, type KnownForCredit } from "@/lib/tmdb/known-for";

function credit(partial: Partial<KnownForCredit> & Pick<KnownForCredit, "tmdbId" | "name">): KnownForCredit {
  return { mediaType: "movie", backdropPath: `/${partial.tmdbId}.jpg`, voteCount: 100, ...partial };
}

// Neil Patrick Harris's credits as TMDb lists them (trimmed): a third-billed
// part in a much bigger film, guest spots, cameos as himself and a 208-episode
// lead.
const nph = {
  personName: "Neil Patrick Harris",
  knownForDepartment: "Acting",
  cast: [
    credit({ tmdbId: 210577, name: "Gone Girl", order: 2, voteCount: 20459, character: "Desi Collings" }),
    credit({ tmdbId: 456, name: "The Simpsons", mediaType: "tv", episodeCount: 1, voteCount: 11036, character: "Neil Patrick Harris (voice)" }),
    credit({ tmdbId: 1100, name: "How I Met Your Mother", mediaType: "tv", episodeCount: 208, voteCount: 5972, character: "Barney Stinson" }),
    credit({ tmdbId: 563, name: "Starship Troopers", order: 4, voteCount: 5726, character: "Colonel Carl Jenkins" }),
    credit({ tmdbId: 41513, name: "The Smurfs", order: 1, voteCount: 4089, character: "Patrick Winslow" }),
    credit({ tmdbId: 11282, name: "Harold & Kumar Go to White Castle", order: 3, voteCount: 2382, character: "Neil Patrick Harris" }),
    credit({ tmdbId: 22980, name: "The Tonight Show", mediaType: "tv", episodeCount: 40, voteCount: 90000, character: "Self", genreIds: [10767] }),
  ],
  crew: [],
};

describe("pickPersonKnownFor", () => {
  it("picks an actor's lead over a bigger film they had a supporting part in", () => {
    expect(pickPersonKnownFor(nph)?.name).toBe("How I Met Your Mother");
  });

  it("is the same title whatever order the credits come in", () => {
    expect(pickPersonKnownFor({ ...nph, cast: [...nph.cast].reverse() })?.name).toBe("How I Met Your Mother");
  });

  it("counts a TV series regular by episodes: 20+ is a lead, 10+ main cast, fewer not at all", () => {
    const show = (episodeCount: number) =>
      credit({ tmdbId: 1, name: "Show", mediaType: "tv", episodeCount, voteCount: 50_000 });
    const film = credit({ tmdbId: 2, name: "Film", order: 2, voteCount: 1000 });
    expect(pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [show(3), film], crew: [] })?.name).toBe("Film");
    expect(pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [show(12), film], crew: [] })?.name).toBe("Show");
    const lead = credit({ tmdbId: 3, name: "Lead film", order: 0, voteCount: 10 });
    expect(pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [show(12), lead], crew: [] })?.name).toBe("Lead film");
    expect(pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [show(25), lead], crew: [] })?.name).toBe("Show");
  });

  it("weighs a show's votes up against a film's in the same tier", () => {
    const friends = credit({ tmdbId: 1668, name: "Friends", mediaType: "tv", episodeCount: 228, voteCount: 9427 });
    const millers = credit({ tmdbId: 138843, name: "We're the Millers", order: 0, voteCount: 9687 });
    expect(pickPersonKnownFor({ personName: "Jennifer Aniston", knownForDepartment: "Acting", cast: [millers, friends], crew: [] })?.name).toBe("Friends");
  });

  it("uses a director's directing credits, not their cameos", () => {
    const nolan = {
      personName: "Christopher Nolan",
      knownForDepartment: "Directing",
      cast: [credit({ tmdbId: 9, name: "A cameo", order: 0, voteCount: 90_000 })],
      crew: [
        credit({ tmdbId: 27205, name: "Inception", department: "Directing", job: "Director", voteCount: 38000 }),
        credit({ tmdbId: 157336, name: "Interstellar", department: "Directing", job: "Director", voteCount: 41291 }),
        credit({ tmdbId: 1, name: "Man of Steel", department: "Production", job: "Producer", voteCount: 99_000 }),
        credit({ tmdbId: 2, name: "Something he wrote", department: "Writing", job: "Screenplay", voteCount: 99_000 }),
      ],
    };
    expect(pickPersonKnownFor(nolan)?.name).toBe("Interstellar");
  });

  it("counts a creator's show for a writer", () => {
    const gilligan = {
      personName: "Vince Gilligan",
      knownForDepartment: "Writing",
      cast: [],
      crew: [
        credit({ tmdbId: 8960, name: "Hancock", department: "Writing", job: "Writer", voteCount: 10510 }),
        credit({ tmdbId: 1396, name: "Breaking Bad", mediaType: "tv", department: "Creator", job: "Creator", voteCount: 18708 }),
      ],
    };
    expect(pickPersonKnownFor(gilligan)?.name).toBe("Breaking Bad");
  });

  it("falls back to their acting when a crew person has no crew credit to show", () => {
    const result = pickPersonKnownFor({
      personName: "X",
      knownForDepartment: "Directing",
      cast: [credit({ tmdbId: 5, name: "Their lead", order: 0 })],
      crew: [],
    });
    expect(result?.name).toBe("Their lead");
  });

  it("skips titles without a backdrop, and is null when none has one", () => {
    const noArt = credit({ tmdbId: 1100, name: "How I Met Your Mother", mediaType: "tv", episodeCount: 208, backdropPath: null });
    const smurfs = credit({ tmdbId: 41513, name: "The Smurfs", order: 1, voteCount: 4089 });
    expect(pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [noArt, smurfs], crew: [] })?.name).toBe("The Smurfs");
    expect(
      pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [noArt, { ...smurfs, backdropPath: null }], crew: [] }),
    ).toBeNull();
  });

  it("is null for someone with only bit parts and appearances", () => {
    const result = pickPersonKnownFor({
      personName: "X",
      knownForDepartment: "Acting",
      cast: [
        credit({ tmdbId: 1, name: "Extra", order: 30 }),
        credit({ tmdbId: 2, name: "Talk show", mediaType: "tv", episodeCount: 50, character: "Himself" }),
      ],
      crew: [],
    });
    expect(result).toBeNull();
  });

  it("breaks a tie in votes by id, so the pick never flips", () => {
    const a = credit({ tmdbId: 20, name: "B", order: 0, voteCount: 500 });
    const b = credit({ tmdbId: 10, name: "A", order: 0, voteCount: 500 });
    expect(pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [a, b], crew: [] })?.tmdbId).toBe(10);
    expect(pickPersonKnownFor({ personName: "X", knownForDepartment: "Acting", cast: [b, a], crew: [] })?.tmdbId).toBe(10);
  });
});

describe("pickCatalogKnownFor", () => {
  const title = (tmdbId: number, voteCount: number | null, backdropPath: string | null = "/b.jpg") => ({
    mediaType: "movie" as const,
    tmdbId,
    backdropPath,
    voteCount,
  });

  it("picks the most-voted title with a backdrop", () => {
    expect(pickCatalogKnownFor([title(1, 100), title(2, 9000, null), title(3, 5000), title(4, null)])?.tmdbId).toBe(3);
  });

  it("is null for an empty catalog or one with no votes known", () => {
    expect(pickCatalogKnownFor([])).toBeNull();
    expect(pickCatalogKnownFor([title(1, null), title(2, 0)])).toBeNull();
  });
});
