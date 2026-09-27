import { describe, expect, it } from "vitest";
import { parseLanguageInput, parseRegionInput, regionFromLocale, resolveDiscoverLocale } from "./locale";

describe("discover locale settings", () => {
  it("accepts a known region in any case and refuses others", () => {
    expect(parseRegionInput("gb")).toEqual({ ok: true, value: "GB" });
    expect(parseRegionInput("")).toEqual({ ok: true, value: null });
    expect(parseRegionInput(null)).toEqual({ ok: true, value: null });
    expect(parseRegionInput("XX")).toEqual({ ok: false });
    expect(parseRegionInput(12)).toEqual({ ok: false });
  });

  it("accepts a language, 'any', or nothing", () => {
    expect(parseLanguageInput("JA")).toEqual({ ok: true, value: "ja" });
    expect(parseLanguageInput("any")).toEqual({ ok: true, value: "any" });
    expect(parseLanguageInput(undefined)).toEqual({ ok: true, value: null });
    expect(parseLanguageInput("klingon")).toEqual({ ok: false });
  });

  it("takes the server's region from its locale, else US", () => {
    expect(regionFromLocale("en-GB")).toBe("GB");
    expect(regionFromLocale("pt_BR")).toBe("BR");
    expect(regionFromLocale("C")).toBe("US");
    expect(regionFromLocale(null)).toBe("US");
    expect(regionFromLocale("en-XX")).toBe("US");
  });

  it("resolves the stored settings into what TMDb is asked", () => {
    expect(resolveDiscoverLocale({ streamingRegion: null, discoverRegion: null, discoverLanguage: null }, "fr-FR")).toEqual({
      streamingRegion: "FR",
      discoverRegion: null,
      discoverLanguage: "en",
    });
    expect(
      resolveDiscoverLocale({ streamingRegion: "DE", discoverRegion: "DE", discoverLanguage: "any" }, "en-US"),
    ).toEqual({ streamingRegion: "DE", discoverRegion: "DE", discoverLanguage: null });
    expect(
      resolveDiscoverLocale({ streamingRegion: "bad", discoverRegion: "bad", discoverLanguage: "ja" }, "en-US"),
    ).toEqual({ streamingRegion: "US", discoverRegion: null, discoverLanguage: "ja" });
  });
});
