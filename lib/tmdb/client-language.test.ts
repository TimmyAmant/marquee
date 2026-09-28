import { beforeEach, describe, expect, it, vi } from "vitest";

// Which language the TMDb client asks in: lists, search and Discover follow
// the request's reader (here an API request's Accept-Language); the details
// the database caches are always English, whoever is reading.

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => null }));
const settings = vi.hoisted(() => ({ discoverRegion: null as string | null }));
vi.mock("@/lib/integrations/app-settings", () => ({
  getTmdbAccessToken: async () => "0123456789abcdef0123456789abcdef",
  getStoredDiscoverLocale: async () => ({ streamingRegion: "US", discoverRegion: settings.discoverRegion, discoverLanguage: null }),
}));

import * as tmdb from "@/lib/tmdb/client";
import { runInLanguageScope } from "@/lib/i18n/request-scope";

const calls: URL[] = [];

beforeEach(() => {
  calls.length = 0;
  settings.discoverRegion = null;
  vi.stubGlobal("fetch", async (input: string | URL) => {
    calls.push(new URL(String(input)));
    return new Response(JSON.stringify({ results: [], genres: [], episodes: [], parts: [] }), { status: 200 });
  });
});

const languageOf = (index = 0) => calls[index].searchParams.get("language");

describe("the language TMDb is asked in", () => {
  it("is the reader's for search, Discover, trending, upcoming and collections", async () => {
    await runInLanguageScope("es-ES,es;q=0.9", async () => {
      await tmdb.searchMovies("dune");
      await tmdb.searchTv("dune");
      await tmdb.searchMulti("dune");
      await tmdb.searchPeople("dune");
      await tmdb.discoverMovies({ sort: "popularity" });
      await tmdb.discoverTv({ sort: "popularity" });
      await tmdb.getTrendingAll();
      await tmdb.getUpcomingMovies();
      await tmdb.getUpcomingTv();
      await tmdb.getCollection(10);
      await tmdb.discoverForShelf("movie", { genreId: 27 });
    });
    expect(calls.map((url) => url.searchParams.get("language"))).toEqual(Array(11).fill("es-ES"));
  });

  it("follows the Discover region for Spanish and French", async () => {
    settings.discoverRegion = "MX";
    await runInLanguageScope("es", () => tmdb.searchMovies("roma"));
    settings.discoverRegion = "CA";
    await runInLanguageScope("fr", () => tmdb.searchMovies("roma"));
    await runInLanguageScope("pt-BR", () => tmdb.searchMovies("roma"));
    expect([languageOf(0), languageOf(1), languageOf(2)]).toEqual(["es-MX", "fr-CA", "pt-BR"]);
  });

  it("is English outside a request, and for a reader in English", async () => {
    await tmdb.searchMovies("dune");
    await runInLanguageScope("en-GB", () => tmdb.searchMovies("dune"));
    await runInLanguageScope("ja", () => tmdb.searchMovies("dune"));
    expect([languageOf(0), languageOf(1), languageOf(2)]).toEqual(["en-US", "en-US", "en-US"]);
  });

  it("is always English for what the database caches", async () => {
    await runInLanguageScope("de", async () => {
      await tmdb.getMovieDetails(603).catch(() => undefined);
      await tmdb.getTvDetails(1399).catch(() => undefined);
      await tmdb.getPersonDetails(1).catch(() => undefined);
      await tmdb.getPersonCombinedCredits(1);
      await tmdb.getCompanyDetails(1).catch(() => undefined);
      await tmdb.discoverMoviesByCompany(1);
      await tmdb.getMovieGenres();
      await tmdb.getTvSeasonDetails(1399, 1);
    });
    expect(calls.map((url) => url.searchParams.get("language"))).toEqual(Array(8).fill(null));
  });

  it("asks for a title's translation with its artwork and trailers in that language", async () => {
    await tmdb.getLocalizedTitleDetails("movie", 603, "pt-BR");
    const url = calls[0];
    expect(url.pathname).toBe("/3/movie/603");
    expect(url.searchParams.get("language")).toBe("pt-BR");
    expect(url.searchParams.get("include_image_language")).toBe("pt,en,null");
    expect(url.searchParams.get("include_video_language")).toBe("pt");
  });
});
