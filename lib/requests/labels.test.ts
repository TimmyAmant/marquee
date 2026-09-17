import { describe, it, expect } from "vitest";
import { myRequestBadge, reviewedRequestLabel } from "./labels";

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
