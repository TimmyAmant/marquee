import { describe, expect, it } from "vitest";
import { LIBRARY_STATUSES, STATUS_TEXT, TONE_CLASS, statusClasses, statusTone } from "./status-tone";

describe("statusTone", () => {
  it("gives each library status its own color", () => {
    expect(statusTone("owned")).toBe("owned");
    expect(statusTone("tracked_downloading")).toBe("downloading");
    expect(statusTone("tracked_monitored")).toBe("missing");
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
    expect(statusClasses("coming_soon").strip).toBe("bg-soon");
    expect(statusClasses("owned").strip).toBe("bg-owned");
    expect(statusClasses("tracked_downloading").strip).toBe("bg-tracked");
  });

  it("uses no Tailwind palette colors, only the theme tokens", () => {
    for (const tone of Object.values(TONE_CLASS)) {
      expect(`${tone.pill} ${tone.strip ?? ""}`).not.toMatch(/(red|purple|yellow|orange|amber)-\d/);
    }
  });
});

describe("STATUS_TEXT", () => {
  it("explains every status for the color key", () => {
    for (const status of LIBRARY_STATUSES) {
      expect(STATUS_TEXT[status].name).toBeTruthy();
      expect(STATUS_TEXT[status].meaning).toBeTruthy();
    }
  });
});
