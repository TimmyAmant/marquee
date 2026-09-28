import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The translation cache (title_translations) on a real Postgres (PGlite):
// one row per title and language beside the English title, full ones
// fetched lazily and refreshed after the TTL, light ones from lists never
// overwriting a full one, and bulk reads for lists.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
const fetched = vi.hoisted(() => ({ calls: [] as string[], fail: false }));
vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  contentLanguageFor: async (locale: string) => ({ es: "es-ES", fr: "fr-FR" })[locale] ?? "en-US",
  getLocalizedTitleDetails: async (_type: string, id: number, language: string) => {
    fetched.calls.push(`${id}:${language}`);
    if (fetched.fail) throw new Error("TMDb is down");
    return { id, title: `Título ${fetched.calls.length}`, overview: "", tagline: "Lema", poster_path: "/es.jpg", genres: [{ id: 1, name: "Acción" }] };
  },
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { titles, titleTranslations } from "@/lib/db/schema";
import { getSavedTranslations, getTitleTranslation, getTranslatedNames, saveLightTranslations } from "@/lib/tmdb/translations";
import { TTL_MS } from "@/lib/tmdb/cache-policy";

async function db() {
  return (await testDatabase()).db;
}

async function addTitle(tmdbId: number, name: string) {
  const [row] = await (await db()).insert(titles).values({ mediaType: "movie", tmdbId, name }).returning();
  return row;
}

beforeEach(async () => {
  await resetTestDatabase();
  fetched.calls.length = 0;
  fetched.fail = false;
});

describe("getTitleTranslation", () => {
  it("is nothing for English, without asking TMDb", async () => {
    const matrix = await addTitle(603, "The Matrix");
    expect(await getTitleTranslation(matrix, "en")).toBeNull();
    expect(fetched.calls).toEqual([]);
  });

  it("fetches once per language, keeps it, and refreshes it after the TTL", async () => {
    const matrix = await addTitle(603, "The Matrix");
    const first = await getTitleTranslation(matrix, "es");
    expect(first).toMatchObject({ name: "Título 1", overview: null, tagline: "Lema", posterPath: "/es.jpg" });
    expect(first?.details?.genres).toEqual([{ id: 1, name: "Acción" }]);
    expect((await getTitleTranslation(matrix, "es"))?.name).toBe("Título 1");
    await getTitleTranslation(matrix, "fr");
    expect(fetched.calls).toEqual(["603:es-ES", "603:fr-FR"]);

    await (await db())
      .update(titleTranslations)
      .set({ refreshedAt: new Date(Date.now() - TTL_MS - 1000) })
      .where(eq(titleTranslations.language, "es"));
    expect((await getTitleTranslation(matrix, "es"))?.name).toBe("Título 3");
  });

  it("serves what's saved when TMDb can't be reached, else nothing", async () => {
    const matrix = await addTitle(603, "The Matrix");
    fetched.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await getTitleTranslation(matrix, "es")).toBeNull();
    await saveLightTranslations("es", [{ titleId: matrix.id, name: "Matrix", posterPath: null }]);
    expect((await getTitleTranslation(matrix, "es"))?.name).toBe("Matrix");
  });

  it("turns a light copy into a full one the first time the page is opened", async () => {
    const matrix = await addTitle(603, "The Matrix");
    await saveLightTranslations("es", [{ titleId: matrix.id, name: "Matrix", posterPath: "/light.jpg" }]);
    expect((await getTitleTranslation(matrix, "es"))?.name).toBe("Título 1");
    expect(fetched.calls).toHaveLength(1);
  });
});

describe("light translations and bulk reads", () => {
  it("saves list names without overwriting a full translation", async () => {
    const matrix = await addTitle(603, "The Matrix");
    const heat = await addTitle(949, "Heat");
    await getTitleTranslation(matrix, "es");
    await saveLightTranslations("es", [
      { titleId: matrix.id, name: "Matrix (lista)", posterPath: "/list.jpg" },
      { titleId: heat.id, name: "Fuego contra fuego", overview: "Un atraco.", posterPath: null },
    ]);
    // English isn't a translation.
    await saveLightTranslations("en", [{ titleId: heat.id, name: "Heat" }]);

    const saved = await getSavedTranslations([matrix.id, heat.id], "es");
    expect(saved.get(matrix.id)?.name).toBe("Título 1");
    expect(saved.get(heat.id)).toMatchObject({ name: "Fuego contra fuego", overview: "Un atraco.", details: null });
    expect((await getSavedTranslations([heat.id], "fr")).size).toBe(0);
    expect((await (await db()).select().from(titleTranslations)).map((row) => row.language).sort()).toEqual(["es", "es"]);

    // A later list updates a light copy, keeping what it left out.
    await saveLightTranslations("es", [{ titleId: heat.id, name: "Heat: Fuego contra fuego", posterPath: "/heat-es.jpg" }]);
    expect((await getSavedTranslations([heat.id], "es")).get(heat.id)).toMatchObject({
      name: "Heat: Fuego contra fuego",
      overview: "Un atraco.",
      posterPath: "/heat-es.jpg",
    });
  });

  it("finds saved names by media type and TMDb id", async () => {
    const heat = await addTitle(949, "Heat");
    await (await db()).insert(titles).values({ mediaType: "tv", tmdbId: 949, name: "Some Show" });
    await saveLightTranslations("es", [{ titleId: heat.id, name: "Fuego contra fuego" }]);
    const names = await getTranslatedNames(
      [
        { mediaType: "movie", tmdbId: 949 },
        { mediaType: "tv", tmdbId: 949 },
      ],
      "es",
    );
    expect([...names]).toEqual([["movie:949", "Fuego contra fuego"]]);
  });
});
