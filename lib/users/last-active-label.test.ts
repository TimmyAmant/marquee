import { describe, expect, it } from "vitest";
import { englishT, translatorFor } from "@/lib/i18n/catalog";
import { lastActiveLabel } from "./last-active-label";

describe("lastActiveLabel", () => {
  const t = englishT();
  const now = new Date("2026-09-25T20:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const min = 60 * 1000;

  it("reads naturally at every distance", () => {
    expect(lastActiveLabel(t, null, now)).toBe("Never signed in");
    expect(lastActiveLabel(t, ago(3 * min), now)).toBe("Active now");
    expect(lastActiveLabel(t, ago(25 * min), now)).toBe("Active 25 minutes ago");
    expect(lastActiveLabel(t, ago(60 * min), now)).toBe("Active 1 hour ago");
    expect(lastActiveLabel(t, ago(5 * 60 * min), now)).toBe("Active 5 hours ago");
    expect(lastActiveLabel(t, ago(30 * 60 * min), now)).toBe("Active yesterday");
    expect(lastActiveLabel(t, ago(6 * 24 * 60 * min), now)).toBe("Active 6 days ago");
    expect(lastActiveLabel(t, new Date("2026-07-04T12:00:00Z"), now)).toBe("Last active Jul 4, 2026");
  });

  it("speaks the reader's language", () => {
    const fr = translatorFor("fr");
    expect(lastActiveLabel(fr, ago(30 * 60 * min), now)).toBe("Dernière activité hier");
    expect(lastActiveLabel(fr, ago(5 * 60 * min), now)).toBe("Dernière activité il y a 5 heures");
  });
});
