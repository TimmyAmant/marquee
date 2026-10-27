import { describe, expect, it } from "vitest";
import { defaultCreditFilter, isSelfAppearance, matchesCreditFilter } from "@/lib/tmdb/credit-kind";

const movie = (title: string, character: string, genre_ids: number[]) =>
  ({ media_type: "movie" as const, title, character, genre_ids });
const tv = (name: string, character: string, genre_ids: number[]) =>
  ({ media_type: "tv" as const, name, character, genre_ids });

describe("isSelfAppearance", () => {
  it("keeps ordinary parts", () => {
    expect(isSelfAppearance(movie("Lost in Translation", "Bob Harris", [18, 35, 10749]), "Bill Murray")).toBe(false);
    expect(isSelfAppearance(movie("Fantastic Mr. Fox", "Badger (voice)", [16, 35]), "Bill Murray")).toBe(false);
    expect(isSelfAppearance(movie("Ghostbusters", "Dr. Peter Venkman (uncredited)", [35, 14]), "Bill Murray")).toBe(false);
  });

  it("keeps playing yourself in a scripted film", () => {
    // Named after the person.
    expect(isSelfAppearance(movie("Zombieland", "Bill Murray", [28, 35, 27]), "Bill Murray")).toBe(false);
    // Credited as "Himself", but a scripted feature.
    expect(isSelfAppearance(movie("Space Jam", "Himself", [16, 35, 10751]), "Michael Jordan")).toBe(false);
  });

  it("drops documentaries and biographies whatever the character", () => {
    expect(isSelfAppearance(movie("Being Bill Murray", "Himself", [99]), "Bill Murray")).toBe(true);
    expect(isSelfAppearance(movie("Planet Earth", "Narrator (voice)", [99]), "David Attenborough")).toBe(true);
    expect(isSelfAppearance(tv("Inside the Actors Studio", "Self", [99, 10767]), "Bill Murray")).toBe(true);
  });

  it("drops talk, news and reality TV", () => {
    expect(isSelfAppearance(tv("Late Show with David Letterman", "Self - Guest", [10767, 35]), "Bill Murray")).toBe(true);
    expect(isSelfAppearance(tv("Today", "Bill Murray", [10763]), "Bill Murray")).toBe(true);
  });

  it("drops archive footage", () => {
    expect(isSelfAppearance(movie("Some Film", "Peter Venkman (archive footage)", [35]), "Bill Murray")).toBe(true);
  });

  it("drops 'himself' outside a scripted feature", () => {
    expect(isSelfAppearance(tv("Saturday Night Live", "Self - Host", [35]), "Bill Murray")).toBe(true);
    expect(isSelfAppearance(movie("Killin' Them Softly", "Himself", [35]), "Dave Chappelle")).toBe(true);
    expect(isSelfAppearance(movie("Dave Chappelle: The Closer", "Himself", [35, 18]), "Dave Chappelle")).toBe(true);
    expect(isSelfAppearance(movie("The 90th Academy Awards", "Himself", [10770]), "Bill Murray")).toBe(true);
    expect(isSelfAppearance(movie("Live in Concert", "Self", [10402]), "Bill Murray")).toBe(true);
    expect(isSelfAppearance(movie("Featurette", "Himself", []), "Bill Murray")).toBe(true);
  });
});

describe("defaultCreditFilter", () => {
  it("opens an actor's page on their parts", () => {
    expect(defaultCreditFilter("Acting", [["acting"], ["self"], ["crew"]])).toBe("acting");
  });

  it("opens a director's page on their films", () => {
    expect(defaultCreditFilter("Directing", [["acting"], ["crew"]])).toBe("crew");
  });

  it("falls back when the preferred kind is empty", () => {
    expect(defaultCreditFilter("Directing", [["acting"], ["self"]])).toBe("acting");
    expect(defaultCreditFilter("Acting", [["self"]])).toBe("all");
  });
});

describe("matchesCreditFilter", () => {
  it("matches a title under each kind it has", () => {
    expect(matchesCreditFilter(["acting", "crew"], "crew")).toBe(true);
    expect(matchesCreditFilter(["self"], "acting")).toBe(false);
    expect(matchesCreditFilter(["self"], "all")).toBe(true);
  });
});
