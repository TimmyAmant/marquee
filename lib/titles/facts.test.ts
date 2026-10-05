import { describe, expect, it } from "vitest";
import { httpsUrlOrNull, moneyOrNull, originalTitleOf, releaseDatesFor, streamingProvidersFor } from "./facts";

const dates = {
  results: [
    {
      iso_3166_1: "US",
      release_dates: [
        { type: 1, release_date: "2024-03-01T00:00:00.000Z" },
        { type: 3, release_date: "2024-03-15T00:00:00.000Z" },
        { type: 4, release_date: "2024-05-20T00:00:00.000Z" },
        { type: 4, release_date: "2024-05-10T00:00:00.000Z" },
      ],
    },
    {
      iso_3166_1: "GB",
      release_dates: [
        { type: 2, release_date: "2024-03-20T00:00:00.000Z" },
        { type: 5, release_date: "2024-07-01T00:00:00.000Z" },
      ],
    },
  ],
};

describe("title facts", () => {
  it("picks the earliest of each release kind for the region", () => {
    expect(releaseDatesFor(dates, "us")).toEqual({
      region: "US",
      theatrical: "2024-03-15",
      digital: "2024-05-10",
      physical: null,
    });
  });

  it("uses a limited theatrical release when there's no wide one", () => {
    expect(releaseDatesFor(dates, "GB")).toEqual({
      region: "GB",
      theatrical: "2024-03-20",
      digital: null,
      physical: "2024-07-01",
    });
  });

  it("falls back to the US, then the first region; null with nothing", () => {
    expect(releaseDatesFor(dates, "FR")?.region).toBe("US");
    expect(releaseDatesFor({ results: [dates.results[1]] }, "FR")?.region).toBe("GB");
    expect(releaseDatesFor({ results: [] }, "US")).toBeNull();
    expect(releaseDatesFor(undefined, "US")).toBeNull();
  });

  it("treats TMDb's 0 money as unknown", () => {
    expect(moneyOrNull(0)).toBeNull();
    expect(moneyOrNull(undefined)).toBeNull();
    expect(moneyOrNull(185000000.4)).toBe(185000000);
  });

  it("shows the original title only when it differs", () => {
    expect(originalTitleOf("movie", { original_title: "La Haine" } as never, "Hate")).toBe("La Haine");
    expect(originalTitleOf("movie", { original_title: "Hate" } as never, "Hate")).toBeNull();
    expect(originalTitleOf("tv", { original_name: "Dark" } as never, "Dark")).toBeNull();
    expect(originalTitleOf("tv", null, "Dark")).toBeNull();
  });

  it("lists a region's subscription providers once each, with TMDb's link", () => {
    const providers = {
      results: {
        DE: {
          link: "https://www.themoviedb.org/movie/1/watch?locale=DE",
          flatrate: [
            { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg" },
            { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg" },
          ],
        },
      },
    };
    expect(streamingProvidersFor(providers, "de")).toEqual({
      region: "DE",
      providers: [{ providerId: 8, name: "Netflix", logoPath: "/n.jpg" }],
      link: "https://www.themoviedb.org/movie/1/watch?locale=DE",
    });
    expect(streamingProvidersFor(providers, "US")).toEqual({ region: "US", providers: [], link: null });
  });

  it("only links to an https watch page", () => {
    expect(httpsUrlOrNull("https://www.themoviedb.org/movie/1/watch")).toBe("https://www.themoviedb.org/movie/1/watch");
    expect(httpsUrlOrNull("javascript:alert(1)")).toBeNull();
    expect(httpsUrlOrNull("http://example.com")).toBeNull();
    expect(httpsUrlOrNull("not a url")).toBeNull();
    expect(httpsUrlOrNull(undefined)).toBeNull();
    const providers = { results: { US: { link: "javascript:alert(1)", flatrate: [] } } };
    expect(streamingProvidersFor(providers, "US").link).toBeNull();
  });
});
