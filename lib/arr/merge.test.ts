import { describe, expect, it } from "vitest";
import type { LibraryStatus } from "@/components/status-badge";
import { mergeServerCopies, mergeSeasonStates } from "./merge";

function copy(serverId: string, tmdbId: number, status: LibraryStatus, arrId = 1) {
  return { serverId, tmdbId, fields: { status, arrId } };
}

describe("mergeServerCopies", () => {
  it("keeps one row per title, the furthest-along copy", () => {
    const merged = mergeServerCopies(
      [
        copy("a", 603, "tracked_monitored", 10),
        copy("b", 603, "owned", 20),
        copy("a", 604, "coming_soon"),
        copy("b", 604, "tracked_downloading"),
      ],
      ["a", "b"],
    );
    expect(merged).toEqual([copy("b", 603, "owned", 20), copy("b", 604, "tracked_downloading")]);
  });

  it("prefers the server listed first (the default) between equals", () => {
    expect(mergeServerCopies([copy("b", 1, "owned", 2), copy("a", 1, "owned", 1)], ["a", "b"])).toEqual([
      copy("a", 1, "owned", 1),
    ]);
    expect(mergeServerCopies([copy("a", 1, "owned", 1), copy("b", 1, "owned", 2)], ["a", "b"])).toEqual([
      copy("a", 1, "owned", 1),
    ]);
  });

  it("keeps a title only one server has", () => {
    expect(mergeServerCopies([copy("b", 7, "untracked")], ["a", "b"])).toEqual([copy("b", 7, "untracked")]);
    expect(mergeServerCopies([], ["a"])).toEqual([]);
  });
});

describe("mergeSeasonStates", () => {
  const season = (seasonNumber: number, have: number, total: number, monitored: boolean, complete: boolean) => ({
    seasonNumber,
    have,
    total,
    monitored,
    complete,
  });

  it("takes each season from the server furthest along with it", () => {
    const a = [season(1, 10, 10, true, true), season(2, 0, 8, false, false)];
    const b = [season(1, 3, 10, true, false), season(2, 5, 8, true, false), season(3, 0, 6, true, false)];
    expect(mergeSeasonStates([a, b])).toEqual([
      season(1, 10, 10, true, true),
      season(2, 5, 8, true, false),
      season(3, 0, 6, true, false),
    ]);
  });

  it("breaks a tie on episodes on disk, and sorts by season", () => {
    const a = [season(2, 1, 8, true, false)];
    const b = [season(2, 4, 8, true, false), season(0, 0, 3, false, false)];
    expect(mergeSeasonStates([a, b])).toEqual([season(0, 0, 3, false, false), season(2, 4, 8, true, false)]);
  });

  it("is the one server's seasons when there's one", () => {
    const a = [season(1, 2, 2, true, true)];
    expect(mergeSeasonStates([a])).toEqual(a);
  });
});
