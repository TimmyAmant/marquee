import { describe, expect, it } from "vitest";
import { normalizeServerUrl, parseArrKind, parseArrServerInput, SERVER_NAME_MAX_LENGTH } from "./server-input";

describe("parseArrServerInput", () => {
  it("reads and tidies every field", () => {
    expect(
      parseArrServerInput({
        name: "  Radarr 2 ",
        baseUrl: " http://192.168.1.10:7878/// ",
        apiKey: " key ",
        is4k: true,
        isDefault: false,
        qualityProfileId: 4,
        rootFolderPath: " /movies ",
        tags: [3, 1, 3],
        seriesType: "anime",
        seasonFolders: true,
        animeQualityProfileId: null,
        animeRootFolderPath: "",
        animeTags: [],
      }),
    ).toEqual({
      ok: true,
      input: {
        name: "Radarr 2",
        baseUrl: "http://192.168.1.10:7878",
        apiKey: "key",
        is4k: true,
        isDefault: false,
        qualityProfileId: 4,
        rootFolderPath: "/movies",
        tags: [1, 3],
        seriesType: "anime",
        seasonFolders: true,
        animeQualityProfileId: null,
        animeRootFolderPath: null,
        animeTags: [],
      },
    });
  });

  it("leaves out what wasn't sent, so an edit changes only that", () => {
    expect(parseArrServerInput({ isDefault: true })).toEqual({ ok: true, input: { isDefault: true } });
    expect(parseArrServerInput({})).toEqual({ ok: true, input: {} });
  });

  it("keeps an explicit null, which clears a nullable field", () => {
    expect(parseArrServerInput({ qualityProfileId: null, rootFolderPath: null })).toEqual({
      ok: true,
      input: { qualityProfileId: null, rootFolderPath: null },
    });
  });

  it("refuses wrong types and bad values with a message for each", () => {
    expect(parseArrServerInput({ name: 3 })).toEqual({ ok: false, error: '"name" must be a string.' });
    expect(parseArrServerInput({ name: "x".repeat(SERVER_NAME_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      error: `Name can be at most ${SERVER_NAME_MAX_LENGTH} characters.`,
    });
    expect(parseArrServerInput({ baseUrl: "ftp://nas" }).ok).toBe(false);
    expect(parseArrServerInput({ baseUrl: "nas:7878" }).ok).toBe(false);
    expect(parseArrServerInput({ is4k: "yes" })).toEqual({ ok: false, error: '"is4k" must be true or false.' });
    expect(parseArrServerInput({ qualityProfileId: 1.5 })).toEqual({
      ok: false,
      error: '"qualityProfileId" must be a number.',
    });
    expect(parseArrServerInput({ rootFolderPath: 7 })).toEqual({ ok: false, error: '"rootFolderPath" must be a string.' });
    expect(parseArrServerInput({ tags: [1, -2] })).toEqual({ ok: false, error: '"tags" must be a list of numbers.' });
    expect(parseArrServerInput({ animeTags: "1" })).toEqual({ ok: false, error: '"animeTags" must be a list of numbers.' });
    expect(parseArrServerInput({ seriesType: "weekly" })).toEqual({
      ok: false,
      error: '"seriesType" must be standard, daily or anime.',
    });
  });
});

describe("small helpers", () => {
  it("trims URLs", () => {
    expect(normalizeServerUrl("  https://arr.example.com/radarr/  ")).toBe("https://arr.example.com/radarr");
  });

  it("knows the two kinds", () => {
    expect(parseArrKind("sonarr")).toBe("sonarr");
    expect(parseArrKind("radarr")).toBe("radarr");
    expect(parseArrKind("sonarr4k")).toBeNull();
    expect(parseArrKind(undefined)).toBeNull();
  });
});
