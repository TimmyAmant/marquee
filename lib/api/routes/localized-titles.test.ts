import { beforeEach, describe, expect, it, vi } from "vitest";

// TMDb's words in the reader's language, end to end: GET /titles/{type}/{id}
// and GET /titles/{type}/{id}/seasons/{n} through the real route, loader,
// TMDb client, title cache and translation cache, on a real Postgres
// (PGlite), with only TMDb's HTTP answers faked. The language comes from the
// account's choice, else Accept-Language; English is the cached copy, and a
// translation is fetched once and kept beside it, falling back to English
// field by field.

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());

const USER_ID = "22222222-2222-4222-8222-222222222222";
const who = vi.hoisted(() => ({ language: null as string | null, region: null as string | null }));

vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async () => ({
    tokenId: "t",
    tokenName: "test",
    expiresAt: new Date("2030-01-01"),
    user: {
      id: "22222222-2222-4222-8222-222222222222",
      username: "reader",
      displayName: null,
      role: "member",
      language: who.language,
      autoApproveMovies: false,
      autoApproveTv: false,
      permissions: ["requestMovies", "requestTv"],
      avatarUpdatedAt: null,
      createdAt: new Date("2026-01-01"),
    },
  }),
}));
vi.mock("@/lib/integrations/library-owner", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLibraryOwnerUserId: async () => null,
}));
vi.mock("@/lib/integrations/app-settings", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTmdbAccessToken: async () => "0123456789abcdef0123456789abcdef",
  getStoredDiscoverLocale: async () => ({ streamingRegion: "US", discoverRegion: who.region, discoverLanguage: null }),
  getTvdbApiKey: async () => null,
}));
vi.mock("@/lib/ratings/cache", () => ({ getTitleRatings: async () => null }));

import { GET as getTitle } from "@/app/api/v1/titles/[type]/[id]/route";
import { GET as getSeason } from "@/app/api/v1/titles/[type]/[id]/seasons/[season]/route";
import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { titleTranslations, users } from "@/lib/db/schema";

const ENGLISH_SHOW = {
  id: 71446,
  name: "Money Heist",
  original_name: "La casa de papel",
  original_language: "es",
  overview: "Eight thieves take hostages in the Royal Mint of Spain.",
  tagline: "The perfect robbery.",
  poster_path: "/en-poster.jpg",
  backdrop_path: "/backdrop.jpg",
  first_air_date: "2017-05-02",
  status: "Ended",
  genres: [
    { id: 80, name: "Crime" },
    { id: 18, name: "Drama" },
  ],
  seasons: [
    { season_number: 1, name: "Part 1", episode_count: 2, air_date: "2017-05-02", poster_path: null },
    { season_number: 2, name: "Part 2", episode_count: 1, air_date: "2017-10-02", poster_path: null },
  ],
  external_ids: { imdb_id: "tt6468322", tvdb_id: 327417, facebook_id: null, instagram_id: null, twitter_id: null },
  images: { logos: [{ file_path: "/en-logo.png", iso_639_1: "en", aspect_ratio: 3 }] },
  videos: { results: [{ key: "enTrailer", site: "YouTube", type: "Trailer", official: true }] },
  credits: { cast: [], crew: [] },
  recommendations: { results: [] },
};

const TRANSLATIONS: Record<string, object> = {
  "es-ES": {
    id: 71446,
    name: "La casa de papel",
    overview: "Ocho ladrones toman rehenes en la Fábrica Nacional de Moneda y Timbre.",
    tagline: "",
    poster_path: "/es-poster.jpg",
    genres: [
      { id: 80, name: "Crimen" },
      { id: 18, name: "Drama" },
    ],
    seasons: [
      { season_number: 1, name: "Parte 1" },
      { season_number: 2, name: "Temporada 2" },
    ],
    images: { logos: [{ file_path: "/es-logo.png", iso_639_1: "es", aspect_ratio: 3 }] },
    videos: { results: [{ key: "esTrailer", site: "YouTube", type: "Trailer", official: true, iso_639_1: "es" }] },
  },
  "es-MX": { id: 71446, name: "La casa de papel (MX)", overview: "", poster_path: null },
  // TMDb's answer for a language nobody translated this into.
  "de-DE": { id: 71446, name: "Haus des Geldes", overview: "", tagline: "", poster_path: null, genres: [] },
};

const SEASON_ONE: Record<string, object> = {
  en: {
    episodes: [
      { id: 1, episode_number: 1, name: "Efectuar lo acordado", overview: "The Professor recruits.", air_date: "2017-05-02", still_path: null },
      { id: 2, episode_number: 2, name: "Imprudencias letales", overview: "Raquel negotiates.", air_date: "2017-05-09", still_path: null },
    ],
  },
  "es-ES": {
    episodes: [
      { id: 1, episode_number: 1, name: "Efectuar lo acordado", overview: "El Profesor recluta.", air_date: "2017-05-02", still_path: null },
      { id: 2, episode_number: 2, name: "Episodio 2", overview: "", air_date: "2017-05-09", still_path: null },
    ],
  },
};

const tmdbCalls: URL[] = [];

function tmdbAnswer(url: URL): unknown {
  const language = url.searchParams.get("language");
  if (url.pathname === "/3/tv/71446") return language ? TRANSLATIONS[language] : ENGLISH_SHOW;
  if (url.pathname === "/3/tv/71446/season/1") return SEASON_ONE[language ?? "en"];
  return null;
}

beforeEach(async () => {
  await resetTestDatabase();
  const { db } = await testDatabase();
  await db.insert(users).values({ id: USER_ID, username: "reader", role: "member" });
  who.language = null;
  who.region = null;
  tmdbCalls.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    tmdbCalls.push(url);
    const body = tmdbAnswer(url);
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response("{}", { status: 404 });
  });
});

const TOKEN = `Bearer mqt_${"r".repeat(43)}`;

async function title(acceptLanguage?: string) {
  const response = await getTitle(
    new Request("http://marquee.test/api/v1/titles/tv/71446", {
      headers: { authorization: TOKEN, ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}) },
    }),
    { params: Promise.resolve({ type: "tv", id: "71446" }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    name: string;
    overview: string;
    tagline: string | null;
    posterPath: string | null;
    facts: { genres: string[]; originalTitle: string | null };
    links: { trailerYoutubeKey: string | null };
    seasons: { seasonNumber: number; name: string }[];
  };
}

const translationFetches = () => tmdbCalls.filter((url) => url.pathname === "/3/tv/71446" && url.searchParams.has("language"));

describe("GET /titles/{type}/{id} in the reader's language", () => {
  it("is English by default, and the cache asks TMDb in English", async () => {
    const body = await title();
    expect(body.name).toBe("Money Heist");
    expect(body.facts.genres).toEqual(["Crime", "Drama"]);
    expect(translationFetches()).toHaveLength(0);
  });

  it("follows Accept-Language, field by field, and keeps the translation", async () => {
    const body = await title("es-ES,es;q=0.9,en;q=0.5");
    expect(body.name).toBe("La casa de papel");
    expect(body.overview).toMatch(/^Ocho ladrones/);
    // TMDb has no Spanish tagline: English stands in.
    expect(body.tagline).toBe("The perfect robbery.");
    expect(body.posterPath).toBe("/es-poster.jpg");
    expect(body.facts.genres).toEqual(["Crimen", "Drama"]);
    expect(body.links.trailerYoutubeKey).toBe("esTrailer");
    // The original name is the one shown now, so it isn't repeated.
    expect(body.facts.originalTitle).toBeNull();
    const [fetched] = translationFetches();
    expect(fetched.searchParams.get("language")).toBe("es-ES");
    expect(fetched.searchParams.get("include_image_language")).toBe("es,en,null");

    const { db } = await testDatabase();
    const saved = await db.select().from(titleTranslations);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ language: "es", name: "La casa de papel", tagline: null });

    // Opened again: from the database, not TMDb.
    await title("es");
    expect(translationFetches()).toHaveLength(1);
    // English readers still get the English copy.
    expect((await title("en")).name).toBe("Money Heist");
  });

  it("prefers the account's own language over Accept-Language", async () => {
    who.language = "de";
    const body = await title("es");
    expect(body.name).toBe("Haus des Geldes");
    // German has no overview or genres on TMDb: English, not blanks.
    expect(body.overview).toMatch(/^Eight thieves/);
    expect(body.facts.genres).toEqual(["Crime", "Drama"]);
    expect(body.posterPath).toBe("/en-poster.jpg");
    // An English trailer beats none; the English logo isn't kept for a
    // different name (checked in lib/tmdb/language.test.ts).
    expect(body.links.trailerYoutubeKey).toBe("enTrailer");
    expect(body.facts.originalTitle).toBe("La casa de papel");
  });

  it("asks TMDb for Latin-American Spanish in a Latin-American Discover region", async () => {
    who.region = "MX";
    const body = await title("es");
    expect(translationFetches()[0].searchParams.get("language")).toBe("es-MX");
    expect(body.name).toBe("La casa de papel (MX)");
    expect(body.overview).toMatch(/^Eight thieves/);
  });

  it("names seasons and episodes in the language, English where TMDb only has a placeholder", async () => {
    const body = await title("es");
    expect(body.seasons.map((season) => [season.seasonNumber, season.name])).toEqual(
      expect.arrayContaining([
        [1, "Parte 1"],
        [2, "Temporada 2"],
      ]),
    );

    const response = await getSeason(
      new Request("http://marquee.test/api/v1/titles/tv/71446/seasons/1", {
        headers: { authorization: TOKEN, "accept-language": "es" },
      }),
      { params: Promise.resolve({ type: "tv", id: "71446", season: "1" }) },
    );
    expect(response.status).toBe(200);
    const season = (await response.json()) as { episodes: { episodeNumber: number; name: string; overview: string | null }[] };
    expect(season.episodes.map((e) => [e.episodeNumber, e.name, e.overview])).toEqual([
      [1, "Efectuar lo acordado", "El Profesor recluta."],
      [2, "Imprudencias letales", "Raquel negotiates."],
    ]);
  });

  it("stays English when TMDb can't be asked for the translation", async () => {
    await title();
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.has("language")) return new Response("{}", { status: 503 });
      const body = tmdbAnswer(url);
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const body = await title("fr");
    expect(body.name).toBe("Money Heist");
    expect(body.overview).toMatch(/^Eight thieves/);
  });
});
