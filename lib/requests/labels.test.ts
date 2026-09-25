import { describe, it, expect } from "vitest";
import {
  activityRequestTitle,
  myRequestBadge,
  quotedRequestTitle,
  reviewedRequestLabel,
  seasonsLabel,
} from "./labels";

describe("seasonsLabel", () => {
  it("is null for a whole-series request", () => {
    expect(seasonsLabel(null)).toBeNull();
    expect(seasonsLabel([])).toBeNull();
  });

  it("names a single season", () => {
    expect(seasonsLabel([2])).toBe("Season 2");
  });

  it("collapses consecutive seasons into ranges", () => {
    expect(seasonsLabel([1, 2, 3])).toBe("Seasons 1–3");
    expect(seasonsLabel([1, 2, 3, 5, 7, 8])).toBe("Seasons 1–3, 5, 7–8");
    expect(seasonsLabel([1, 3])).toBe("Seasons 1, 3");
    expect(seasonsLabel([4, 5])).toBe("Seasons 4–5");
  });

  it("calls season 0 Specials", () => {
    expect(seasonsLabel([0])).toBe("Specials");
    expect(seasonsLabel([0, 1])).toBe("Specials, Season 1");
    expect(seasonsLabel([0, 1, 2])).toBe("Specials, Seasons 1–2");
  });

  it("tolerates unsorted or repeated input", () => {
    expect(seasonsLabel([3, 1, 2, 2])).toBe("Seasons 1–3");
  });
});

describe("request titles with seasons", () => {
  it("leaves whole-series titles exactly as before", () => {
    expect(quotedRequestTitle("Severance", null)).toBe('"Severance"');
    expect(activityRequestTitle("Severance", null)).toBe("Severance");
  });

  it("appends the seasons label", () => {
    expect(quotedRequestTitle("Severance", [2])).toBe('"Severance" (Season 2)');
    expect(activityRequestTitle("Severance", [1, 2])).toBe("Severance (Seasons 1–2)");
  });
});

describe("myRequestBadge", () => {
  it("labels pending and rejected requests regardless of library status", () => {
    expect(myRequestBadge("pending", "owned", false)).toEqual({ label: "Pending review", tone: "pending" });
    expect(myRequestBadge("rejected", null, false)).toEqual({ label: "Declined", tone: "declined" });
  });

  it("refines approved requests by live library status", () => {
    expect(myRequestBadge("approved", "owned", false).label).toBe("In your library");
    expect(myRequestBadge("approved", "tracked_downloading", false).label).toBe("Downloading");
    expect(myRequestBadge("approved", "coming_soon", false).label).toBe("Coming soon");
  });

  it("prefers real library status over the manual-approval flag", () => {
    expect(myRequestBadge("approved", "owned", true).label).toBe("In your library");
  });

  it("falls back to manual/plain approval", () => {
    expect(myRequestBadge("approved", "untracked", true)).toEqual({ label: "Manually approved", tone: "approved" });
    expect(myRequestBadge("approved", "tracked_monitored", false)).toEqual({ label: "Approved", tone: "approved" });
    expect(myRequestBadge("approved", null, false).label).toBe("Approved");
  });
});

describe("reviewedRequestLabel", () => {
  it("matches the admin's Past requests table", () => {
    expect(reviewedRequestLabel("approved", false)).toBe("Approved");
    expect(reviewedRequestLabel("approved", true)).toBe("Manually approved");
    expect(reviewedRequestLabel("rejected", false)).toBe("Rejected");
  });
});
