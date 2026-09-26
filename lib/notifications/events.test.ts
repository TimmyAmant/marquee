import { describe, expect, it } from "vitest";
import { notificationEventTypeValues } from "@/lib/db/schema";
import {
  bellAndPushFor,
  channelWants,
  defaultHouseholdEvents,
  eventsFor,
  householdEvents,
  householdWants,
  preferenceEventFor,
} from "./events";

describe("notification events", () => {
  it("lists reviewer events only for reviewers, and problem reports only for the admin", () => {
    expect(eventsFor("member")).toEqual([
      "request_approved",
      "request_declined",
      "request_available",
      "request_downloading",
      "request_still_looking",
      "issue_updated",
      "title_shared",
    ]);
    expect(eventsFor("trusted")).toEqual([...eventsFor("member"), "request_pending", "request_not_found", "watchlist_requests"]);
    expect(eventsFor("admin")).toEqual([
      ...eventsFor("member"),
      "request_pending",
      "request_not_found",
      "issue_reported",
      "watchlist_requests",
    ]);
  });

  it("never lists comments until they exist", () => {
    expect(eventsFor("admin")).not.toContain("request_comment");
    expect(householdEvents).not.toContain("request_comment");
  });

  it("maps every notification type onto an event", () => {
    for (const type of notificationEventTypeValues) expect(preferenceEventFor(type)).toBeTruthy();
    expect(preferenceEventFor("request_rejected")).toBe("request_declined");
    expect(preferenceEventFor("downloaded")).toBe("request_available");
    expect(preferenceEventFor("grabbed")).toBe("request_downloading");
    expect(preferenceEventFor("issue_resolved")).toBe("issue_updated");
    expect(preferenceEventFor("request_created")).toBe("request_pending");
    expect(preferenceEventFor("request_not_found")).toBe("request_not_found");
    expect(preferenceEventFor("title_shared")).toBe("title_shared");
  });
});

describe("a shared title", () => {
  it("goes to the bell and devices by default, a new personal channel only when chosen", () => {
    expect(bellAndPushFor(undefined, "title_shared")).toEqual({ inApp: true, push: true });
    expect(bellAndPushFor({ title_shared: { push: false } }, "title_shared")).toEqual({ inApp: true, push: false });
    expect(channelWants({}, "title_shared")).toBe(false);
    expect(channelWants({ title_shared: true }, "title_shared")).toBe(true);
  });

  it("never goes to the household channels, even if a saved list names it", () => {
    expect(householdEvents).not.toContain("title_shared");
    expect(householdWants(null, "title_shared")).toBe(false);
    expect(householdWants(["title_shared"], "title_shared")).toBe(false);
  });
});

describe("defaults keep today's behaviour", () => {
  it("puts everything in the bell and on devices when nothing was chosen", () => {
    for (const event of eventsFor("admin").filter((e) => e !== "request_still_looking")) {
      expect(bellAndPushFor(undefined, event)).toEqual({ inApp: true, push: true });
      expect(bellAndPushFor({}, event)).toEqual({ inApp: true, push: true });
    }
  });

  it("follows a choice for one delivery and leaves the other at its default", () => {
    const overrides = { request_approved: { push: false } };
    expect(bellAndPushFor(overrides, "request_approved")).toEqual({ inApp: true, push: false });
    expect(bellAndPushFor(overrides, "request_declined")).toEqual({ inApp: true, push: true });
  });

  it("posts to the household channels exactly what they posted before", () => {
    // Everything that was relayed before (approved, declined, the admin's
    // grabbed/downloaded, new requests, watchlist batches, problem reports);
    // not a member's "your problem is fixed", which never was.
    expect(defaultHouseholdEvents).toEqual([
      "request_approved",
      "request_declined",
      "request_available",
      "request_downloading",
      "request_pending",
      "request_not_found",
      "issue_reported",
      "watchlist_requests",
    ]);
    expect(householdWants(null, "issue_updated")).toBe(false);
    expect(householdWants(null, "request_pending")).toBe(true);
    expect(householdWants(["issue_updated"], "issue_updated")).toBe(true);
    expect(householdWants([], "request_pending")).toBe(false);
  });

  it("sends a new personal channel everything but the chatty 'started downloading'", () => {
    expect(channelWants({}, "request_available")).toBe(true);
    expect(channelWants({}, "request_downloading")).toBe(false);
    expect(channelWants({ request_downloading: true }, "request_downloading")).toBe(true);
    expect(channelWants({ request_available: false }, "request_available")).toBe(false);
  });
});

describe("Can't find", () => {
  it("reaches reviewers everywhere by default", () => {
    expect(bellAndPushFor(undefined, "request_not_found")).toEqual({ inApp: true, push: true });
    expect(channelWants({}, "request_not_found")).toBe(true);
    expect(householdWants(null, "request_not_found")).toBe(true);
  });

  it("tells the requester in the bell only, unless they choose more", () => {
    expect(bellAndPushFor(undefined, "request_still_looking")).toEqual({ inApp: true, push: false });
    expect(bellAndPushFor({ request_still_looking: { push: true } }, "request_still_looking")).toEqual({ inApp: true, push: true });
    expect(channelWants({}, "request_still_looking")).toBe(false);
    // The reviewers' alert already went to the household channels.
    expect(householdEvents).not.toContain("request_still_looking");
  });
});
