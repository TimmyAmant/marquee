import { describe, expect, it } from "vitest";
import {
  SEARCH_SECTION_ORDER,
  hasExactName,
  matchNetworks,
  nameMatchScore,
  normalizeName,
  parseQuery,
  rankCompanies,
  rankPeople,
  rankTitles,
  searchText,
  themePlacement,
} from "./rank";
import { CURATED_NETWORKS } from "@/lib/tmdb/curated-companies";

describe("section order", () => {
  it("is Movies, TV Shows, People, Studios & Networks", () => {
    expect(SEARCH_SECTION_ORDER).toEqual(["movie", "tv", "person", "company"]);
  });
});

describe("normalizeName", () => {
  it("drops case, accents and punctuation, and spells out & and +", () => {
    expect(normalizeName("Amélie")).toBe("amelie");
    expect(normalizeName("Disney+")).toBe("disney plus");
    expect(normalizeName("Law & Order: SVU")).toBe("law and order svu");
    expect(normalizeName("  Spider-Man  ")).toBe("spider man");
  });
});

describe("parseQuery / searchText", () => {
  it("reads a trailing year as a hint", () => {
    expect(parseQuery("dune 2021")).toEqual({ full: "dune 2021", text: "dune", year: 2021 });
    expect(parseQuery("Dune (1984)")).toEqual({ full: "dune 1984", text: "dune", year: 1984 });
    expect(searchText("dune 2021")).toBe("dune");
  });

  it("keeps a year on its own, and other numbers, as the title", () => {
    expect(parseQuery("1917")).toEqual({ full: "1917", text: "1917", year: null });
    expect(searchText("1917")).toBe("1917");
    expect(parseQuery("ocean's 11").year).toBeNull();
  });
});

describe("nameMatchScore", () => {
  const q = parseQuery("dune");
  it("scores exact over prefix over all-words over nothing", () => {
    expect(nameMatchScore("Dune", q)).toBe(1000);
    expect(nameMatchScore("Dune: Part Two", q)).toBe(500);
    expect(nameMatchScore("Children of Dune", q)).toBe(300);
    expect(nameMatchScore("Arrakis", q)).toBe(0);
    expect(nameMatchScore(null, q)).toBe(0);
  });
});

describe("rankTitles", () => {
  const dunes = [
    { name: "Dune: Part Two", year: "2024", popularity: 400 },
    { name: "Dune", year: "1984", popularity: 30 },
    { name: "Children of Dune", year: "2003", popularity: 20 },
    { name: "Dune", year: "2021", popularity: 150 },
  ];

  it("puts exact titles first, the more popular one ahead", () => {
    expect(rankTitles(dunes, "dune").map((t) => `${t.name} ${t.year}`)).toEqual([
      "Dune 2021",
      "Dune 1984",
      "Dune: Part Two 2024",
      "Children of Dune 2003",
    ]);
  });

  it("lifts the year the query names", () => {
    expect(rankTitles(dunes, "dune 1984")[0]).toMatchObject({ name: "Dune", year: "1984" });
    expect(rankTitles(dunes, "dune 2024")[0]).toMatchObject({ name: "Dune: Part Two" });
  });

  it("matches a title that ends in a number exactly", () => {
    const titles = [
      { name: "Blade Runner", year: "1982", popularity: 80 },
      { name: "Blade Runner 2049", year: "2017", popularity: 90 },
    ];
    expect(rankTitles(titles, "blade runner 2049")[0].name).toBe("Blade Runner 2049");
  });

  it("keeps TMDb's order among equals", () => {
    const same = [
      { name: "Alpha", year: null },
      { name: "Beta", year: null },
    ];
    expect(rankTitles(same, "zzz").map((t) => t.name)).toEqual(["Alpha", "Beta"]);
  });

  it("counts the original title, a little behind the translated one", () => {
    const titles = [
      { name: "Spirited Away 2", originalName: null, year: null, popularity: 5 },
      { name: "Spirited Away", originalName: "千と千尋の神隠し", year: "2001", popularity: 5 },
    ];
    expect(rankTitles(titles, "spirited away")[0].name).toBe("Spirited Away");
  });
});

describe("rankPeople", () => {
  it("puts the exact name first, then popularity", () => {
    const people = [
      { name: "Tom Hanks Jr.", popularity: 1 },
      { name: "Colin Hanks", popularity: 20 },
      { name: "Tom Hanks", popularity: 90 },
    ];
    expect(rankPeople(people, "tom hanks").map((p) => p.name)).toEqual(["Tom Hanks", "Tom Hanks Jr.", "Colin Hanks"]);
  });
});

describe("rankCompanies / matchNetworks", () => {
  it("finds networks by name or another name for them", () => {
    expect(matchNetworks(CURATED_NETWORKS, "hbo").map((n) => n.name)).toEqual(["HBO"]);
    expect(matchNetworks(CURATED_NETWORKS, "max").map((n) => n.name)).toEqual(["HBO"]);
    expect(matchNetworks(CURATED_NETWORKS, "disney plus").map((n) => n.name)).toEqual(["Disney+"]);
    expect(matchNetworks(CURATED_NETWORKS, "Apple").map((n) => n.name)).toEqual(["Apple TV+"]);
    expect(matchNetworks(CURATED_NETWORKS, "a24")).toEqual([]);
    expect(matchNetworks(CURATED_NETWORKS, "h")).toEqual([]);
  });

  it("ranks the exact studio or network first, networks and logos ahead of equals", () => {
    const items = [
      { name: "A24 Films LLC", logoPath: null, kind: "studio" as const },
      { name: "A24", logoPath: "/a24.png", kind: "studio" as const },
    ];
    expect(rankCompanies(items, "a24")[0].name).toBe("A24");

    const hbo = [
      { name: "HBO Films", logoPath: "/f.png", kind: "studio" as const },
      { name: "HBO", logoPath: "/h.png", kind: "studio" as const },
      { name: "HBO", logoPath: "/n.png", kind: "network" as const },
    ];
    expect(rankCompanies(hbo, "hbo").map((c) => `${c.name}/${c.kind}`)).toEqual([
      "HBO/network",
      "HBO/studio",
      "HBO Films/studio",
    ]);
  });
});

describe("themePlacement", () => {
  it("leads with a genre the query names", () => {
    expect(themePlacement({ query: "horror", label: "Horror", isGenre: true, exactMatchElsewhere: true })).toBe("first");
  });

  it("leads with a keyword the query names when nothing else is named that", () => {
    expect(
      themePlacement({ query: "natural disaster", label: "natural disaster", isGenre: false, exactMatchElsewhere: false }),
    ).toBe("first");
  });

  it("goes last when a title is named that too, or the theme only partly matches", () => {
    expect(themePlacement({ query: "dune", label: "dune", isGenre: false, exactMatchElsewhere: true })).toBe("last");
    expect(themePlacement({ query: "sci", label: "Science Fiction", isGenre: true, exactMatchElsewhere: false })).toBe("last");
  });
});

describe("hasExactName", () => {
  it("is true only for an exact (normalized) name", () => {
    expect(hasExactName(["Dune: Part Two", "DUNE"], "dune")).toBe(true);
    expect(hasExactName(["Dune: Part Two"], "dune")).toBe(false);
  });
});
