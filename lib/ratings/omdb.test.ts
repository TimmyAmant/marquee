import { describe, expect, it } from "vitest";
import { hasAnyRating, parseOmdbRatings } from "./omdb";

describe("OMDb ratings", () => {
  it("reads IMDb, Rotten Tomatoes and Metacritic from a full answer", () => {
    expect(
      parseOmdbRatings({
        Response: "True",
        imdbRating: "8.7",
        imdbVotes: "2,145,332",
        Metascore: "73",
        Ratings: [
          { Source: "Internet Movie Database", Value: "8.7/10" },
          { Source: "Rotten Tomatoes", Value: "83%" },
          { Source: "Metacritic", Value: "73/100" },
        ],
      }),
    ).toEqual({ imdbRating: 8.7, imdbVotes: 2145332, rottenTomatoesCritics: 83, metacritic: 73 });
  });

  it("treats N/A and missing parts as unknown", () => {
    const ratings = parseOmdbRatings({
      Response: "True",
      imdbRating: "N/A",
      imdbVotes: "N/A",
      Metascore: "N/A",
      Ratings: [{ Source: "Rotten Tomatoes", Value: "91%" }],
    });
    expect(ratings).toEqual({ imdbRating: null, imdbVotes: null, rottenTomatoesCritics: 91, metacritic: null });
    expect(hasAnyRating(ratings)).toBe(true);
  });

  it("falls back to the Ratings list for IMDb and Metacritic", () => {
    expect(
      parseOmdbRatings({
        Response: "True",
        Ratings: [
          { Source: "Internet Movie Database", Value: "6.4/10" },
          { Source: "Metacritic", Value: "55/100" },
        ],
      }),
    ).toEqual({ imdbRating: 6.4, imdbVotes: null, rottenTomatoesCritics: null, metacritic: 55 });
  });

  it("reads a refusal or a miss as nothing known", () => {
    const empty = { imdbRating: null, imdbVotes: null, rottenTomatoesCritics: null, metacritic: null };
    expect(parseOmdbRatings({ Response: "False", Error: "Error getting data." })).toEqual(empty);
    expect(parseOmdbRatings(null)).toEqual(empty);
    expect(hasAnyRating(empty)).toBe(false);
  });

  it("ignores values outside their scales", () => {
    expect(parseOmdbRatings({ Response: "True", imdbRating: "12", Metascore: "140" })).toEqual({
      imdbRating: null,
      imdbVotes: null,
      rottenTomatoesCritics: null,
      metacritic: null,
    });
  });
});
