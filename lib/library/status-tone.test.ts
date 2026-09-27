import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LIBRARY_STATUSES,
  statusColorsNote,
  statusText,
  TONE_CLASS,
  isUnwanted,
  statusClasses,
  statusTone,
} from "./status-tone";
import { englishT } from "@/lib/i18n/catalog";

const t = englishT();

describe("statusTone", () => {
  it("gives each library status its own color", () => {
    expect(statusTone("owned")).toBe("owned");
    expect(statusTone("tracked_downloading")).toBe("downloading");
    expect(statusTone("tracked_monitored")).toBe("missing");
    expect(statusTone("tracked_unmonitored")).toBe("unmonitored");
    expect(statusTone("coming_soon")).toBe("soon");
    expect(statusTone("untracked")).toBe("neutral");
  });

  it("reads an unknown or absent status as neutral", () => {
    expect(statusTone(undefined)).toBe("neutral");
    expect(statusTone(null)).toBe("neutral");
    expect(statusTone("something_new" as never)).toBe("neutral");
  });

  it("never shares a tone between two statuses", () => {
    const tones = LIBRARY_STATUSES.map(statusTone);
    expect(new Set(tones).size).toBe(LIBRARY_STATUSES.length);
  });

  it("lists the statuses in the color key's order", () => {
    expect(LIBRARY_STATUSES).toEqual([
      "owned",
      "tracked_downloading",
      "tracked_monitored",
      "tracked_unmonitored",
      "coming_soon",
      "untracked",
    ]);
  });
});

describe("statusClasses", () => {
  it("draws no poster strip for titles not in the library", () => {
    expect(statusClasses("untracked").strip).toBeNull();
    expect(statusClasses(undefined).strip).toBeNull();
  });

  it("uses the shared tokens for the badge, pill and strip of the same status", () => {
    expect(statusClasses("tracked_monitored")).toEqual({
      pill: "bg-missing-bg text-missing border-missing/30",
      strip: "bg-missing",
    });
    expect(statusClasses("tracked_unmonitored")).toEqual({
      pill: "bg-unmonitored-bg text-unmonitored border-unmonitored/30",
      strip: "bg-unmonitored",
    });
    expect(statusClasses("coming_soon").strip).toBe("bg-soon");
    expect(statusClasses("owned").strip).toBe("bg-owned");
    expect(statusClasses("tracked_downloading").strip).toBe("bg-downloading");
  });

  it("uses no Tailwind palette colors, only the theme tokens", () => {
    for (const tone of Object.values(TONE_CLASS)) {
      expect(`${tone.pill} ${tone.strip ?? ""}`).not.toMatch(/(red|purple|yellow|orange|amber|blue|green)-\d/);
    }
  });
});

describe("isUnwanted", () => {
  it("keeps requests open for titles nothing will download on its own", () => {
    expect(isUnwanted("untracked")).toBe(true);
    expect(isUnwanted("tracked_unmonitored")).toBe(true);
    expect(isUnwanted(null)).toBe(true);
    expect(isUnwanted(undefined)).toBe(true);
  });

  it("closes them for anything in the library or on its way", () => {
    for (const status of ["owned", "tracked_downloading", "tracked_monitored", "coming_soon"] as const) {
      expect(isUnwanted(status)).toBe(false);
    }
  });
});

describe("statusText", () => {
  it("explains every status for the color key", () => {
    for (const status of LIBRARY_STATUSES) {
      expect(statusText(t, status).name).toBeTruthy();
      expect(statusText(t, status).meaning).toBeTruthy();
    }
  });

  it("names the unmonitored state the way Sonarr/Radarr users will recognize", () => {
    expect(statusText(t, "tracked_unmonitored").name).toBe("Not monitored");
    expect(statusText(t, "tracked_unmonitored").meaning).toMatch(/won't download on its own/);
    expect(statusColorsNote(t)).toBe("Same colors as Radarr and Sonarr.");
  });
});

// The old hue-named "tracked" token is gone; a class still using it would
// silently render with no color at all.
describe("retired color classes", () => {
  it("are used nowhere in app/ or components/", () => {
    const stale = /\b(bg|text|border)-tracked(-bg|\/\d+)?\b/;
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(tsx?|css)$/.test(entry.name) && stale.test(readFileSync(path, "utf8"))) offenders.push(path);
      }
    }
    for (const dir of ["app", "components", "lib"]) walk(join(process.cwd(), dir));
    expect(offenders).toEqual([]);
  });
});

// The tokens themselves, read from app/globals.css: each status wears the
// hue Radarr and Sonarr use for it, and its small text stays readable.
describe("status color tokens", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const dark = css.slice(0, css.indexOf(':root[data-theme="light"]'));
  const light = css.slice(css.indexOf(':root[data-theme="light"]'), css.indexOf("@media (prefers-color-scheme: light)"));

  function token(block: string, name: string): string {
    const match = block.match(new RegExp(`--marquee-${name}:\\s*(#[0-9a-f]{6})`, "i"));
    if (!match) throw new Error(`--marquee-${name} missing`);
    return match[1];
  }

  function rgb(hex: string): [number, number, number] {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  }

  function hue(hex: string): number {
    const [r, g, b] = rgb(hex);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  function luminance(hex: string): number {
    const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Hue ranges in degrees: Radarr/Sonarr green, purple, red, orange, blue.
  const HUES: Record<string, [number, number]> = {
    owned: [90, 170],
    downloading: [250, 290],
    missing: [345, 375],
    unmonitored: [15, 40],
    soon: [200, 230],
  };

  for (const [theme, block, surfaces] of [
    ["dark", dark, ["bg-0", "bg-1"]],
    ["light", light, ["bg-0", "bg-1"]],
  ] as const) {
    for (const [name, [lo, hi]] of Object.entries(HUES)) {
      it(`${theme}: --marquee-${name} is the Radarr/Sonarr hue and clears 4.5:1`, () => {
        const fg = token(block, name);
        const h = hue(fg);
        const wrapped = h < lo ? h + 360 : h;
        expect(wrapped).toBeGreaterThanOrEqual(lo);
        expect(wrapped).toBeLessThanOrEqual(hi);
        expect(contrast(fg, token(block, `${name}-bg`))).toBeGreaterThanOrEqual(4.5);
        for (const surface of surfaces) expect(contrast(fg, token(block, surface))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("repeats the light tokens for the no-JS prefers-color-scheme fallback", () => {
    const fallback = css.slice(css.indexOf("@media (prefers-color-scheme: light)"), css.indexOf("@theme inline"));
    for (const name of [...Object.keys(HUES), ...Object.keys(HUES).map((n) => `${n}-bg`)]) {
      expect(token(fallback, name)).toBe(token(light, name));
    }
  });
});
