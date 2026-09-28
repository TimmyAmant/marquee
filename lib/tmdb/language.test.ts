import { describe, expect, it } from "vitest";
import {
  imageLanguages,
  isGenericEpisodeName,
  mergeEpisodes,
  overlayCard,
  overlayTitle,
  pick,
  pickEpisodeName,
  swapTitleName,
  tmdbContentLanguage,
  type TitleTranslation,
} from "@/lib/tmdb/language";
import { pickTitleLogo } from "@/lib/tmdb/logo";

describe("tmdbContentLanguage", () => {
  it("maps each of Marquee's languages to TMDb's", () => {
    expect(tmdbContentLanguage("en")).toBe("en-US");
    expect(tmdbContentLanguage("es")).toBe("es-ES");
    expect(tmdbContentLanguage("fr")).toBe("fr-FR");
    expect(tmdbContentLanguage("de")).toBe("de-DE");
    expect(tmdbContentLanguage("pt-BR")).toBe("pt-BR");
  });

  it("gives Latin-American Spanish (and Canadian French) to a household whose Discover region is there", () => {
    expect(tmdbContentLanguage("es", "MX")).toBe("es-MX");
    expect(tmdbContentLanguage("es", "ar")).toBe("es-MX");
    expect(tmdbContentLanguage("es", "ES")).toBe("es-ES");
    expect(tmdbContentLanguage("es", null)).toBe("es-ES");
    expect(tmdbContentLanguage("fr", "CA")).toBe("fr-CA");
    expect(tmdbContentLanguage("de", "MX")).toBe("de-DE");
    expect(tmdbContentLanguage("en", "MX")).toBe("en-US");
  });

  it("asks for artwork in the language, then English, then without text", () => {
    expect(imageLanguages("es-MX")).toBe("es,en,null");
    expect(imageLanguages("pt-BR")).toBe("pt,en,null");
    expect(imageLanguages("en-US")).toBe("en,null");
  });
});

describe("per-field fallback", () => {
  it("keeps English where TMDb has no translation", () => {
    expect(pick("Hola", "Hello")).toBe("Hola");
    expect(pick("", "Hello")).toBe("Hello");
    expect(pick("   ", "Hello")).toBe("Hello");
    expect(pick(null, null)).toBeNull();
  });

  it("doesn't take TMDb's placeholder episode names over real ones", () => {
    expect(isGenericEpisodeName("Episodio 3")).toBe(true);
    expect(isGenericEpisodeName("Épisode 12")).toBe(true);
    expect(isGenericEpisodeName("Folge 1")).toBe(true);
    expect(isGenericEpisodeName("El atraco")).toBe(false);
    expect(pickEpisodeName("Episodio 3", "The Heist")).toBe("The Heist");
    expect(pickEpisodeName("Episodio 3", "Episode 3")).toBe("Episodio 3");
    expect(pickEpisodeName("El atraco", "The Heist")).toBe("El atraco");
    expect(pickEpisodeName("", "The Heist")).toBe("The Heist");
  });

  it("merges a season's episodes field by field, in the English order", () => {
    const english = [
      { episode_number: 1, name: "Pilot", overview: "It begins." },
      { episode_number: 2, name: "The Heist", overview: "They go in." },
      { episode_number: 3, name: "Aftermath", overview: "It ends." },
    ];
    const spanish = [
      { episode_number: 2, name: "Episodio 2", overview: "Entran." },
      { episode_number: 1, name: "Piloto", overview: "" },
    ];
    expect(mergeEpisodes(english, spanish)).toEqual([
      { episode_number: 1, name: "Piloto", overview: "It begins." },
      { episode_number: 2, name: "The Heist", overview: "Entran." },
      { episode_number: 3, name: "Aftermath", overview: "It ends." },
    ]);
    expect(mergeEpisodes(english, null)).toBe(english);
  });
});

describe("overlayTitle", () => {
  const title = { id: "t1", name: "Money Heist", overview: "Eight thieves.", posterPath: "/en.jpg", tmdbId: 71446 };
  const raw = {
    tagline: "The heist of the century.",
    genres: [
      { id: 80, name: "Crime" },
      { id: 18, name: "Drama" },
    ],
    seasons: [
      { season_number: 1, name: "Part 1", episode_count: 9 },
      { season_number: 2, name: "Part 2", episode_count: 6 },
    ],
    images: { logos: [{ file_path: "/en-logo.png", iso_639_1: "en", aspect_ratio: 3 }] },
    videos: { results: [{ key: "enTrailer", site: "YouTube", type: "Trailer", official: true }] },
    recommendations: { results: [{ id: 1, name: "Dark", poster_path: "/dark-en.jpg" }] },
    credits: { cast: [{ id: 5, name: "Úrsula Corberó" }] },
  };

  it("is the English copy as-is without a translation", () => {
    expect(overlayTitle(title, raw, null)).toEqual({ title, raw });
  });

  it("lays the translation over, field by field, keeping everything else", () => {
    const translation: TitleTranslation = {
      name: "La casa de papel",
      overview: "",
      tagline: null,
      posterPath: "/es.jpg",
      details: {
        genres: [{ id: 18, name: "Drama" }, { id: 80, name: "Crimen" }],
        seasons: [{ season_number: 1, name: "Parte 1" }, { season_number: 2, name: "Temporada 2" }],
        logo: { file_path: "/es-logo.png", iso_639_1: "es", aspect_ratio: 3 },
        trailerKey: "esTrailer",
        recommendations: [{ id: 1, name: "Dark", posterPath: "/dark-es.jpg" }],
      },
    };
    const { title: shown, raw: shownRaw } = overlayTitle(title, raw, translation);
    expect(shown).toEqual({ ...title, name: "La casa de papel", overview: "Eight thieves.", posterPath: "/es.jpg" });
    expect(shownRaw?.tagline).toBe("The heist of the century.");
    // Same order as the English copy.
    expect(shownRaw?.genres).toEqual([
      { id: 80, name: "Crimen" },
      { id: 18, name: "Drama" },
    ]);
    // "Temporada 2" isn't a placeholder, so it's taken.
    expect(shownRaw?.seasons?.map((s) => s.name)).toEqual(["Parte 1", "Temporada 2"]);
    expect(shownRaw?.seasons?.[0].episode_count).toBe(9);
    expect(pickTitleLogo(shownRaw?.images, "es")?.file_path).toBe("/es-logo.png");
    expect(shownRaw?.videos?.results[0].key).toBe("esTrailer");
    expect(shownRaw?.recommendations?.results[0]).toEqual({ id: 1, name: "Dark", poster_path: "/dark-es.jpg" });
    expect(shownRaw?.credits).toBe(raw.credits);
  });

  it("drops an English logo that would spell a different name", () => {
    const translation: TitleTranslation = {
      name: "La casa de papel",
      overview: null,
      tagline: null,
      posterPath: null,
      details: { logo: null },
    };
    const { title: shown, raw: shownRaw } = overlayTitle(title, raw, translation);
    expect(shown.posterPath).toBe("/en.jpg");
    expect(shownRaw?.images?.logos).toEqual([]);
  });

  it("keeps the English logo when the name is the same", () => {
    const translation: TitleTranslation = { name: "Money Heist", overview: null, tagline: null, posterPath: null, details: { logo: null } };
    expect(overlayTitle(title, raw, translation).raw?.images).toBe(raw.images);
  });

  it("overlays a list card, falling back per field", () => {
    const card = { tmdbId: 1, name: "Dark", posterPath: "/en.jpg" };
    expect(overlayCard(card, { name: "Oscuro", posterPath: null })).toEqual({ tmdbId: 1, name: "Oscuro", posterPath: "/en.jpg" });
    expect(overlayCard(card, undefined)).toBe(card);
  });
});

describe("pickTitleLogo", () => {
  const logos = [
    { file_path: "/en.png", iso_639_1: "en", aspect_ratio: 3, vote_average: 5 },
    { file_path: "/fr.png", iso_639_1: "fr", aspect_ratio: 3, vote_average: 1 },
    { file_path: "/none.png", iso_639_1: null, aspect_ratio: 3, vote_average: 9 },
  ];

  it("prefers the reader's language, then English, then no text", () => {
    expect(pickTitleLogo({ logos }, "fr")?.file_path).toBe("/fr.png");
    expect(pickTitleLogo({ logos }, "de")?.file_path).toBe("/en.png");
    expect(pickTitleLogo({ logos })?.file_path).toBe("/en.png");
    expect(pickTitleLogo({ logos: [logos[2]] }, "fr")?.file_path).toBe("/none.png");
  });
});

describe("swapTitleName", () => {
  it("swaps the English name for the reader's", () => {
    expect(swapTitleName("Money Heist is available", "Money Heist", "La casa de papel")).toBe("La casa de papel is available");
  });

  it("leaves the words alone without a different name", () => {
    expect(swapTitleName("Money Heist is available", "Money Heist", null)).toBe("Money Heist is available");
    expect(swapTitleName("Money Heist is available", "Money Heist", "Money Heist")).toBe("Money Heist is available");
    expect(swapTitleName("a big day", "a", "Un")).toBe("a big day");
  });
});
