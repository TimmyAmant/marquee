import { describe, it, expect } from "vitest";
import {
  CUSTOM_REJECTION_REASON,
  REJECTION_REASON_CODES,
  REJECTION_REASON_MAX_LENGTH,
  localizeRejectionReason,
  normalizeRejectionReason,
  rejectionReasonPresets,
  rejectionReasonText,
  resolveRejectionReason,
} from "./rejection-reasons";
import { englishT, translatorFor } from "@/lib/i18n/catalog";
import { LOCALES } from "@/lib/i18n/locales";

const t = englishT();

describe("normalizeRejectionReason", () => {
  it("returns null for non-strings and blank input", () => {
    expect(normalizeRejectionReason(undefined)).toBeNull();
    expect(normalizeRejectionReason(null)).toBeNull();
    expect(normalizeRejectionReason(42)).toBeNull();
    expect(normalizeRejectionReason("")).toBeNull();
    expect(normalizeRejectionReason("   \n\t ")).toBeNull();
  });

  it("trims and collapses internal whitespace, newlines included", () => {
    expect(normalizeRejectionReason("  We already   have\n\nthis one  ")).toBe("We already have this one");
  });

  it("caps the length without rejecting long input", () => {
    const long = "x".repeat(REJECTION_REASON_MAX_LENGTH + 50);
    expect(normalizeRejectionReason(long)).toHaveLength(REJECTION_REASON_MAX_LENGTH);
    expect(normalizeRejectionReason("x".repeat(REJECTION_REASON_MAX_LENGTH))).toHaveLength(REJECTION_REASON_MAX_LENGTH);
  });

  it("cuts on code points, so an emoji on the boundary is kept whole rather than split", () => {
    const prefix = "x".repeat(REJECTION_REASON_MAX_LENGTH - 1);
    const kept = normalizeRejectionReason(`${prefix}😀 and more`)!;
    expect(kept).toBe(`${prefix}😀`);
    expect(kept.isWellFormed()).toBe(true);
    expect(Array.from(kept)).toHaveLength(REJECTION_REASON_MAX_LENGTH);
    // All emoji: 201 characters is 402 UTF-16 units, and the cut still lands
    // between characters.
    const emoji = "😀".repeat(REJECTION_REASON_MAX_LENGTH + 1);
    expect(normalizeRejectionReason(emoji)).toBe("😀".repeat(REJECTION_REASON_MAX_LENGTH));
  });
});

describe("resolveRejectionReason", () => {
  it("stores a preset's code as its text, in the translator's language", () => {
    const presets = rejectionReasonPresets(t);
    expect(presets[0]).toBe("Already available on a streaming service we have");
    REJECTION_REASON_CODES.forEach((preset, index) => {
      expect(resolveRejectionReason(t, { preset })).toEqual({ ok: true, reason: presets[index] });
    });
    const fr = translatorFor("fr");
    expect(resolveRejectionReason(fr, { preset: "no_space" })).toEqual({
      ok: true,
      reason: rejectionReasonText(fr, "no_space"),
    });
  });

  it("no longer takes a preset's English text as its code", () => {
    expect(resolveRejectionReason(t, { preset: rejectionReasonText(t, "streaming") }).ok).toBe(false);
  });

  it("stores the normalized custom text for Other, never the label itself", () => {
    expect(resolveRejectionReason(t, { preset: CUSTOM_REJECTION_REASON, custom: "  Too  long, sorry " })).toEqual({
      ok: true,
      reason: "Too long, sorry",
    });
  });

  it("asks for text when Other is picked without any", () => {
    expect(resolveRejectionReason(t, { preset: CUSTOM_REJECTION_REASON })).toEqual({
      ok: false,
      error: "Add a short reason, or pick one from the list.",
    });
    expect(resolveRejectionReason(t, { preset: CUSTOM_REJECTION_REASON, custom: "   " }).ok).toBe(false);
    expect(resolveRejectionReason(t, { preset: CUSTOM_REJECTION_REASON, custom: null }).ok).toBe(false);
  });

  it("treats a missing or blank preset as no reason, for older clients", () => {
    expect(resolveRejectionReason(t, {})).toEqual({ ok: true, reason: null });
    expect(resolveRejectionReason(t, { preset: null, custom: "ignored" })).toEqual({ ok: true, reason: null });
    expect(resolveRejectionReason(t, { preset: "  " })).toEqual({ ok: true, reason: null });
    expect(resolveRejectionReason(t, { preset: 7 })).toEqual({ ok: true, reason: null });
  });

  it("refuses a preset that isn't on the list", () => {
    expect(resolveRejectionReason(t, { preset: "Because I said so" })).toEqual({
      ok: false,
      error: "Pick a reason from the list.",
    });
  });
});

describe("localizeRejectionReason", () => {
  const all = LOCALES.map((locale) => translatorFor(locale));

  it("shows a stored preset in the viewer's language, whatever language it was stored in", () => {
    const de = translatorFor("de");
    expect(localizeRejectionReason(de, rejectionReasonText(t, "no_space"), all)).toBe(rejectionReasonText(de, "no_space"));
    expect(localizeRejectionReason(t, rejectionReasonText(translatorFor("es"), "unreleased"), all)).toBe(
      "Not released yet, ask again once it's out",
    );
  });

  it("leaves the admin's own words alone", () => {
    expect(localizeRejectionReason(translatorFor("fr"), "We have it on DVD", all)).toBe("We have it on DVD");
  });
});
