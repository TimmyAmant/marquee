import { describe, it, expect } from "vitest";
import {
  activityRequestTitle,
  myRequestBadge,
  quotedRequestTitle,
  reviewedRequestLabel,
  seasonsLabel,
} from "./labels";
import { englishT, translatorFor } from "@/lib/i18n/catalog";

const t = englishT();

describe("seasonsLabel", () => {
  it("is null for a whole-series request", () => {
    expect(seasonsLabel(t, null)).toBeNull();
    expect(seasonsLabel(t, [])).toBeNull();
  });

  it("names a single season", () => {
    expect(seasonsLabel(t, [2])).toBe("Season 2");
  });

  it("collapses consecutive seasons into ranges", () => {
    expect(seasonsLabel(t, [1, 2, 3])).toBe("Seasons 1–3");
    expect(seasonsLabel(t, [1, 2, 3, 5, 7, 8])).toBe("Seasons 1–3, 5, 7–8");
    expect(seasonsLabel(t, [1, 3])).toBe("Seasons 1, 3");
    expect(seasonsLabel(t, [4, 5])).toBe("Seasons 4–5");
  });

  it("calls season 0 Specials", () => {
    expect(seasonsLabel(t, [0])).toBe("Specials");
    expect(seasonsLabel(t, [0, 1])).toBe("Specials, Season 1");
    expect(seasonsLabel(t, [0, 1, 2])).toBe("Specials, Seasons 1–2");
  });

  it("tolerates unsorted or repeated input", () => {
    expect(seasonsLabel(t, [3, 1, 2, 2])).toBe("Seasons 1–3");
  });
});

describe("request titles with seasons", () => {
  it("leaves whole-series titles exactly as before", () => {
    expect(quotedRequestTitle(t, "Severance", null)).toBe('"Severance"');
    expect(activityRequestTitle(t, "Severance", null)).toBe("Severance");
  });

  it("appends the seasons label", () => {
    expect(quotedRequestTitle(t, "Severance", [2])).toBe('"Severance" (Season 2)');
    expect(activityRequestTitle(t, "Severance", [1, 2])).toBe("Severance (Seasons 1–2)");
  });
});

describe("myRequestBadge", () => {
  it("labels pending and rejected requests regardless of library status", () => {
    expect(myRequestBadge(t, "pending", "owned", false)).toEqual({ label: "Pending review", tone: "pending" });
    expect(myRequestBadge(t, "rejected", null, false)).toEqual({ label: "Declined", tone: "declined" });
  });

  it("refines approved requests by live library status", () => {
    expect(myRequestBadge(t, "approved", "owned", false).label).toBe("In your library");
    expect(myRequestBadge(t, "approved", "tracked_downloading", false).label).toBe("Downloading");
    expect(myRequestBadge(t, "approved", "coming_soon", false).label).toBe("Coming soon");
  });

  it("prefers real library status over the manual-approval flag", () => {
    expect(myRequestBadge(t, "approved", "owned", true).label).toBe("In your library");
  });

  it("falls back to manual/plain approval", () => {
    expect(myRequestBadge(t, "approved", "untracked", true)).toEqual({ label: "Manually approved", tone: "approved" });
    expect(myRequestBadge(t, "approved", "tracked_monitored", false)).toEqual({ label: "Approved", tone: "approved" });
    expect(myRequestBadge(t, "approved", null, false).label).toBe("Approved");
    expect(myRequestBadge(t, "approved", "untracked", false, true)).toEqual({ label: "Approved — waiting to be added", tone: "approved" });
    expect(myRequestBadge(t, "approved", "owned", false, true).label).toBe("In your library");
  });
});

describe("reviewedRequestLabel", () => {
  it("matches the admin's Past requests table", () => {
    expect(reviewedRequestLabel(t, "approved", false)).toBe("Approved");
    expect(reviewedRequestLabel(t, "approved", true)).toBe("Manually approved");
    expect(reviewedRequestLabel(t, "rejected", false)).toBe("Rejected");
  });
});

describe("in another language", () => {
  it("translates the labels", () => {
    const fr = translatorFor("fr");
    expect(seasonsLabel(fr, [1, 2])).toBe("Saisons 1–2");
    expect(myRequestBadge(fr, "pending", null, false).label).toBe("En attente de validation");
    expect(quotedRequestTitle(fr, "Severance", [2])).toBe("«\u00a0Severance\u00a0» (Saison 2)");
  });
});
