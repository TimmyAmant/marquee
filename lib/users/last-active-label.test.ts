import { describe, expect, it } from "vitest";
import { lastActiveLabel } from "./last-active-label";

describe("lastActiveLabel", () => {
  const now = new Date("2026-09-25T20:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const min = 60 * 1000;

  it("reads naturally at every distance", () => {
    expect(lastActiveLabel(null, now)).toBe("Never signed in");
    expect(lastActiveLabel(ago(3 * min), now)).toBe("Active now");
    expect(lastActiveLabel(ago(25 * min), now)).toBe("Active 25 minutes ago");
    expect(lastActiveLabel(ago(60 * min), now)).toBe("Active 1 hour ago");
    expect(lastActiveLabel(ago(5 * 60 * min), now)).toBe("Active 5 hours ago");
    expect(lastActiveLabel(ago(30 * 60 * min), now)).toBe("Active yesterday");
    expect(lastActiveLabel(ago(6 * 24 * 60 * min), now)).toBe("Active 6 days ago");
    expect(lastActiveLabel(new Date("2026-07-04T12:00:00Z"), now)).toBe("Last active Jul 4, 2026");
  });
});
