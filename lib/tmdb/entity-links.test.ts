import { describe, expect, it } from "vitest";
import { buildEntityLinks } from "@/lib/tmdb/entity-links";

describe("buildEntityLinks", () => {
  it("builds every link a person has, in display order", () => {
    expect(
      buildEntityLinks({
        externalIds: {
          imdb_id: "nm0000439",
          instagram_id: "nph",
          twitter_id: "ActuallyNPH",
          facebook_id: "nph",
          tiktok_id: "nph.tok",
          youtube_id: "UCabcdefghijklmnopqrstuv",
        },
        homepage: "https://example.com/nph",
      }),
    ).toEqual([
      { kind: "imdb", url: "https://www.imdb.com/name/nm0000439" },
      { kind: "instagram", url: "https://www.instagram.com/nph" },
      { kind: "twitter", url: "https://x.com/ActuallyNPH" },
      { kind: "facebook", url: "https://www.facebook.com/nph" },
      { kind: "tiktok", url: "https://www.tiktok.com/@nph.tok" },
      { kind: "youtube", url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv" },
      { kind: "homepage", url: "https://example.com/nph" },
    ]);
  });

  it("leaves out what's missing or empty", () => {
    expect(
      buildEntityLinks({ externalIds: { imdb_id: "nm0634240", instagram_id: null, twitter_id: "", tiktok_id: null }, homepage: null }),
    ).toEqual([{ kind: "imdb", url: "https://www.imdb.com/name/nm0634240" }]);
    expect(buildEntityLinks({})).toEqual([]);
    expect(buildEntityLinks({ externalIds: null, homepage: "" })).toEqual([]);
  });

  it("takes handles with an @ or pasted as a whole address", () => {
    expect(buildEntityLinks({ externalIds: { instagram_id: "@nph", youtube_id: "@neilpatrickharris" } })).toEqual([
      { kind: "instagram", url: "https://www.instagram.com/nph" },
      { kind: "youtube", url: "https://www.youtube.com/@neilpatrickharris" },
    ]);
    expect(buildEntityLinks({ externalIds: { twitter_id: "https://twitter.com/ActuallyNPH/" } })).toEqual([
      { kind: "twitter", url: "https://x.com/ActuallyNPH" },
    ]);
  });

  it("refuses anything that isn't a plain handle, IMDb id or web address", () => {
    expect(
      buildEntityLinks({
        externalIds: { imdb_id: "tt0133093", instagram_id: "a/b?c", twitter_id: "<script>" },
        homepage: "javascript:alert(1)",
      }),
    ).toEqual([]);
  });
});
