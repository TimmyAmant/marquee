import { describe, expect, it } from "vitest";
import { placeholderNames, tagNames } from "@/lib/i18n/format-message";
import { LOCALES } from "@/lib/i18n/locales";
import { catalogs, english, NAMESPACES } from "@/lib/i18n/messages";

// Every language has every message English has — nothing missing, nothing
// left over, nothing blank — and keeps each message's placeholders and
// rich-text tags, so a translation can't drop the {count} or the <link>.
// See docs/translating.md.

type Flat = Record<string, string>;

function flatten(catalog: Record<string, Record<string, string>>): Flat {
  const out: Flat = {};
  for (const namespace of NAMESPACES) {
    for (const [key, value] of Object.entries(catalog[namespace] ?? {})) out[`${namespace}.${key}`] = value;
  }
  return out;
}

const source = flatten(english as unknown as Record<string, Record<string, string>>);

describe("English, the source", () => {
  it("has messages, none of them blank", () => {
    expect(Object.keys(source).length).toBeGreaterThan(0);
    const blank = Object.entries(source).filter(([, value]) => typeof value !== "string" || !value.trim());
    expect(blank.map(([key]) => key)).toEqual([]);
  });

  it("keeps its keys flat inside each namespace (no nested objects)", () => {
    for (const namespace of NAMESPACES) {
      for (const [key, value] of Object.entries(english[namespace])) {
        expect(typeof value, `${namespace}.${key}`).toBe("string");
      }
    }
  });
});

describe.each(LOCALES.filter((locale) => locale !== "en"))("%s", (locale) => {
  const translated = flatten(catalogs[locale] as unknown as Record<string, Record<string, string>>);

  it("has every English key", () => {
    const missing = Object.keys(source).filter((key) => !(key in translated));
    expect(missing).toEqual([]);
  });

  it("has no keys English doesn't (renamed or removed ones left behind)", () => {
    const extra = Object.keys(translated).filter((key) => !(key in source));
    expect(extra).toEqual([]);
  });

  it("has no blank messages", () => {
    const blank = Object.entries(translated).filter(([, value]) => typeof value !== "string" || !value.trim());
    expect(blank.map(([key]) => key)).toEqual([]);
  });

  it("keeps every placeholder and tag of the English message", () => {
    const mismatched = Object.entries(source)
      .filter(([key]) => key in translated)
      .filter(
        ([key, english]) =>
          JSON.stringify(placeholderNames(english)) !== JSON.stringify(placeholderNames(translated[key])) ||
          JSON.stringify(tagNames(english)) !== JSON.stringify(tagNames(translated[key])),
      )
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});
