import { describe, expect, it } from "vitest";
import { formatMessage, placeholderNames, tagNames } from "@/lib/i18n/format-message";
import { formatDate, formatNumber, languageName, timeAgo } from "@/lib/i18n/format";
import { intlTag, matchLocale, negotiateLocale, parseLanguageInput, parseLocale, resolveLocale, tmdbLanguage } from "@/lib/i18n/locales";
import { messagesFor, translatorFor } from "@/lib/i18n/catalog";
import { createTranslator } from "@/lib/i18n/translator";

describe("choosing a language", () => {
  it("matches tags case- and separator-insensitively, falling back to the language", () => {
    expect(matchLocale("fr")).toBe("fr");
    expect(matchLocale("FR-ca")).toBe("fr");
    expect(matchLocale("de_AT")).toBe("de");
    expect(matchLocale("es-419")).toBe("es");
    expect(matchLocale("pt")).toBe("pt-BR");
    expect(matchLocale("pt-PT")).toBe("pt-BR");
    expect(matchLocale("pt-br")).toBe("pt-BR");
    expect(matchLocale("en-GB")).toBe("en");
    expect(matchLocale("ja")).toBeNull();
    expect(matchLocale("")).toBeNull();
    expect(matchLocale(null)).toBeNull();
  });

  it("negotiates Accept-Language by q, then order", () => {
    expect(negotiateLocale("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(negotiateLocale("ja,de;q=0.5,es;q=0.7")).toBe("es");
    expect(negotiateLocale("ja, zh")).toBeNull();
    expect(negotiateLocale("de;q=0, fr;q=0.1")).toBe("fr");
    expect(negotiateLocale("*")).toBeNull();
    expect(negotiateLocale(null)).toBeNull();
  });

  it("prefers the account's choice, then the browser, then English", () => {
    expect(resolveLocale("de", "fr")).toBe("de");
    expect(resolveLocale(null, "fr-FR,en;q=0.5")).toBe("fr");
    expect(resolveLocale(null, "ja")).toBe("en");
    expect(resolveLocale("klingon", "es")).toBe("es");
    expect(parseLocale(42)).toBeNull();
  });

  it("maps to Intl and TMDb tags", () => {
    expect(intlTag("en")).toBe("en-US");
    expect(intlTag("pt-BR")).toBe("pt-BR");
    expect(tmdbLanguage("es")).toBe("es-ES");
    expect(tmdbLanguage("pt-BR")).toBe("pt-BR");
  });

  it("accepts only exact languages from a settings form or PATCH /me", () => {
    expect(parseLanguageInput("fr")).toEqual({ ok: true, language: "fr" });
    expect(parseLanguageInput("PT-br")).toEqual({ ok: true, language: "pt-BR" });
    expect(parseLanguageInput(null)).toEqual({ ok: true, language: null });
    expect(parseLanguageInput("")).toEqual({ ok: true, language: null });
    expect(parseLanguageInput("es-MX")).toEqual({ ok: false });
    expect(parseLanguageInput("xx")).toEqual({ ok: false });
    expect(parseLanguageInput(3)).toEqual({ ok: false });
  });
});

describe("formatMessage", () => {
  it("fills in values and formats numbers in the language", () => {
    expect(formatMessage("Hello {name}", { name: "Ana" }, "en-US")).toBe("Hello Ana");
    expect(formatMessage("{n} titles", { n: 12345 }, "de")).toBe("12.345 titles");
    expect(formatMessage("Hello {name}", {}, "en-US")).toBe("Hello {name}");
    expect(formatMessage("No braces", undefined, "en-US")).toBe("No braces");
  });

  it("picks plural forms by the language's rules", () => {
    const message = "{count, plural, =0 {No titles} one {# title} other {# titles}}";
    expect(formatMessage(message, { count: 0 }, "en-US")).toBe("No titles");
    expect(formatMessage(message, { count: 1 }, "en-US")).toBe("1 title");
    expect(formatMessage(message, { count: 2 }, "en-US")).toBe("2 titles");
    expect(formatMessage(message, { count: 1500 }, "en-US")).toBe("1,500 titles");
    // French counts 0 and 1 as "one".
    const fr = "{count, plural, one {# titre} other {# titres}}";
    expect(formatMessage(fr, { count: 0 }, "fr")).toBe("0 titre");
    expect(formatMessage(fr, { count: 2 }, "fr")).toBe("2 titres");
  });

  it("handles select and nested placeholders", () => {
    const message = "{kind, select, movie {The movie {title}} tv {The show {title}} other {{title}}}";
    expect(formatMessage(message, { kind: "movie", title: "Heat" }, "en-US")).toBe("The movie Heat");
    expect(formatMessage(message, { kind: "tv", title: "Lost" }, "en-US")).toBe("The show Lost");
    expect(formatMessage(message, { kind: "x", title: "Up" }, "en-US")).toBe("Up");
    expect(
      formatMessage("{who} asked for {count, plural, one {# season} other {# seasons}}", { who: "Sam", count: 3 }, "en-US"),
    ).toBe("Sam asked for 3 seasons");
  });

  it("lists placeholders and tags for the consistency tests", () => {
    expect(placeholderNames("{a} and {count, plural, one {# {b}} other {# {c}}}")).toEqual(["a", "b", "c", "count"]);
    expect(tagNames("Go to <link>Settings</link> or <b>now</b>")).toEqual(["b", "link"]);
  });
});

describe("translators", () => {
  it("looks keys up, falling back to English for anything untranslated", () => {
    const t = createTranslator("fr", { "common.cancel": "Annuler" });
    expect(t("common.cancel")).toBe("Annuler");
    expect(t("common.save")).toBe("common.save");
    expect(messagesFor("fr")["common.save"]).toBe("Enregistrer");
    expect(translatorFor("de")("common.seasons", { count: 2 })).toBe("2 Staffeln");
    expect(translatorFor("en")("common.seasons", { count: 1 })).toBe("1 season");
  });
});

describe("dates and numbers", () => {
  const date = new Date("2026-07-17T15:04:00Z");

  it("formats dates in the language", () => {
    expect(formatDate("en-US", date, "long", "UTC")).toBe("July 17, 2026");
    expect(formatDate("de", date, "long", "UTC")).toBe("17. Juli 2026");
    expect(formatDate("fr", date, "long", "UTC")).toBe("17 juillet 2026");
    expect(formatDate("en-US", null)).toBe("");
    expect(formatDate("en-US", "not a date")).toBe("");
  });

  it("says how long ago", () => {
    const now = new Date("2026-07-17T18:04:00Z");
    expect(timeAgo("en-US", date, now)).toBe("3 hours ago");
    expect(timeAgo("es", date, now)).toBe("hace 3 horas");
    expect(timeAgo("en-US", new Date("2026-07-16T15:00:00Z"), now)).toBe("yesterday");
    expect(timeAgo("en-US", now, now)).toBe("now");
  });

  it("formats numbers and language names", () => {
    expect(formatNumber("fr", 1234.5)).toMatch(/^1\s234,5$/u);
    expect(languageName("en-US", "ja")).toBe("Japanese");
    expect(languageName("es", "ja")).toBe("japonés");
  });
});
