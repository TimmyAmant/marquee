import { describe, expect, it } from "vitest";
import { ANIME_KEYWORD_ID, ANIMATION_GENRE_ID, isAnime } from "./anime";

const animation = { id: ANIMATION_GENRE_ID, name: "Animation" };

describe("isAnime", () => {
  it("counts TMDb's anime keyword, on a show or a movie", () => {
    expect(isAnime({ keywords: { results: [{ id: ANIME_KEYWORD_ID, name: "anime" }] } })).toBe(true);
    expect(isAnime({ keywords: { keywords: [{ id: ANIME_KEYWORD_ID }] } })).toBe(true);
    // A keyword spelled "anime" under another id counts too.
    expect(isAnime({ keywords: { results: [{ id: 1, name: " Anime " }] } })).toBe(true);
  });

  it("counts Animation from Japan, by origin country, production country or language", () => {
    expect(isAnime({ genres: [animation], origin_country: ["JP"] })).toBe(true);
    expect(isAnime({ genres: [animation], production_countries: [{ iso_3166_1: "JP" }] })).toBe(true);
    expect(isAnime({ genres: [animation], original_language: "ja" })).toBe(true);
  });

  it("leaves western cartoons and Japanese live action alone", () => {
    expect(isAnime({ genres: [animation], origin_country: ["US"], original_language: "en" })).toBe(false);
    expect(isAnime({ genres: [{ id: 18, name: "Drama" }], origin_country: ["JP"], original_language: "ja" })).toBe(false);
    expect(isAnime({ keywords: { results: [{ id: 9715, name: "superhero" }] } })).toBe(false);
  });

  it("treats missing details as not anime", () => {
    expect(isAnime(null)).toBe(false);
    expect(isAnime(undefined)).toBe(false);
    expect(isAnime({})).toBe(false);
    expect(isAnime({ genres: null, keywords: null, origin_country: null })).toBe(false);
  });
});
