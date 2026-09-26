import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { parsePreferenceChanges } from "./preferences";
import { eventsFor } from "./events";

const MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("parsePreferenceChanges", () => {
  const own = new Set([MINE]);

  it("takes changes to the bell, devices and your own channels", () => {
    const parsed = parsePreferenceChanges(
      { events: [{ event: "request_approved", push: false, channels: { [MINE]: true } }] },
      eventsFor("member"),
      own,
    );
    expect(parsed).toEqual({
      ok: true,
      changes: [{ event: "request_approved", inApp: undefined, push: false, channels: { [MINE]: true } }],
    });
  });

  it("refuses someone else's channel exactly like one that doesn't exist", () => {
    const theirs = parsePreferenceChanges({ events: [{ event: "request_approved", channels: { [THEIRS]: true } }] }, eventsFor("member"), own);
    const missing = parsePreferenceChanges(
      { events: [{ event: "request_approved", channels: { "cccccccc-cccc-4ccc-8ccc-cccccccccccc": true } }] },
      eventsFor("member"),
      own,
    );
    expect(theirs).toEqual({ ok: false, error: "There's no channel with that id." });
    expect(missing).toEqual(theirs);
  });

  it("refuses reviewer events for members, and unknown ones", () => {
    expect(parsePreferenceChanges({ events: [{ event: "request_pending", inApp: false }] }, eventsFor("member"), own).ok).toBe(false);
    expect(parsePreferenceChanges({ events: [{ event: "request_pending", inApp: false }] }, eventsFor("trusted"), own).ok).toBe(true);
    expect(parsePreferenceChanges({ events: [{ event: "issue_reported", inApp: false }] }, eventsFor("trusted"), own).ok).toBe(false);
    expect(parsePreferenceChanges({ events: [{ event: "request_comment", inApp: false }] }, eventsFor("admin"), own).ok).toBe(false);
    expect(parsePreferenceChanges({ events: [{ event: "nope" }] }, eventsFor("admin"), own).ok).toBe(false);
  });

  it("wants booleans and a list", () => {
    expect(parsePreferenceChanges({}, eventsFor("member"), own).ok).toBe(false);
    expect(parsePreferenceChanges({ events: [{ event: "request_approved", push: "no" }] }, eventsFor("member"), own).ok).toBe(false);
    expect(parsePreferenceChanges({ events: [{ event: "request_approved", channels: { [MINE]: 1 } }] }, eventsFor("member"), own).ok).toBe(false);
    expect(parsePreferenceChanges({ events: [{ event: "request_approved", channels: [MINE] }] }, eventsFor("member"), own).ok).toBe(false);
  });
});
