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
      "issue_updated",
    ]);
    expect(eventsFor("trusted")).toEqual([...eventsFor("member"), "request_pending", "watchlist_requests"]);
    expect(eventsFor("admin")).toEqual([...eventsFor("member"), "request_pending", "issue_reported", "watchlist_requests"]);
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
  });
});

describe("defaults keep today's behaviour", () => {
  it("puts everything in the bell and on devices when nothing was chosen", () => {
    for (const event of eventsFor("admin")) {
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
