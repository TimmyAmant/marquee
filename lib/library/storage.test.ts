import { describe, expect, it } from "vitest";
import { englishT, translatorFor } from "@/lib/i18n/catalog";
import { storageForecastLine, storageFullOn, storageFullOnLine } from "./storage";
import { splitCollection } from "./query-policy";

// The Storage card's words (the math is disk-space-logic.test.ts), and the
// collections tab's owned/missing split.

const GB = 1024 ** 3;

describe("storageForecastLine", () => {
  const t = englishT();

  it("says there's no forecast yet", () => {
    expect(storageForecastLine(t, null)).toBe("No forecast yet — it needs a couple of days of readings from the daily disk-space snapshot.");
  });

  it("says how long is left and at what rate", () => {
    expect(storageForecastLine(t, { daysRemaining: 42, bytesPerDay: 12.3 * GB })).toBe(
      "Full in about 42 days at the current rate (12.3 GB/day).",
    );
    expect(storageForecastLine(t, { daysRemaining: 1, bytesPerDay: 900 * 1024 ** 2 })).toBe(
      "Full in about 1 day at the current rate (900.0 MB/day).",
    );
    expect(storageForecastLine(t, { daysRemaining: 0, bytesPerDay: 2 * GB })).toBe("Full today at the current rate (2.0 GB/day).");
  });

  it("is translated, units included", () => {
    expect(storageForecastLine(translatorFor("fr"), { daysRemaining: 3, bytesPerDay: 2 * GB })).toBe(
      "Plein dans environ 3 jours au rythme actuel (2,0 Go/jour).",
    );
    expect(storageForecastLine(translatorFor("de"), null)).toContain("Prognose");
  });
});

describe("storageFullOn", () => {
  const now = new Date("2026-09-26T12:00:00Z");

  it("adds the days to today", () => {
    expect(storageFullOn({ daysRemaining: 42, bytesPerDay: 1 }, now).toISOString().slice(0, 10)).toBe("2026-11-07");
    expect(storageFullOn({ daysRemaining: 0, bytesPerDay: 1 }, now).toISOString().slice(0, 10)).toBe("2026-09-26");
  });

  it("names the day in words, or nothing when there's no forecast or it's today", () => {
    expect(storageFullOnLine(englishT(), { daysRemaining: 42, bytesPerDay: 1 }, now)).toBe("Around November 7, 2026.");
    expect(storageFullOnLine(englishT(), { daysRemaining: 0, bytesPerDay: 1 }, now)).toBeNull();
    expect(storageFullOnLine(englishT(), null, now)).toBeNull();
  });
});

describe("splitCollection", () => {
  const parts = [{ tmdbId: 1 }, { tmdbId: 2 }, { tmdbId: 3 }];

  it("is incomplete only with some owned and some missing", () => {
    expect(splitCollection(parts, new Set([1]))).toEqual({ owned: [{ tmdbId: 1 }], missing: [{ tmdbId: 2 }, { tmdbId: 3 }], incomplete: true });
    expect(splitCollection(parts, new Set([1, 2, 3])).incomplete).toBe(false);
    expect(splitCollection(parts, new Set()).incomplete).toBe(false);
  });
});
