import { describe, expect, it } from "vitest";
import { activePhoneTab, moreGroupsFor, phoneTabsFor, showsPhoneTabs } from "@/lib/phone-tabs";

describe("phoneTabsFor", () => {
  it("is the iPhone app's tabs, in its order, for any signed-in account", () => {
    expect(phoneTabsFor(true).map((tab) => tab.id)).toEqual(["discover", "search", "requests", "calendar", "more"]);
  });

  it("is nothing signed out", () => {
    expect(phoneTabsFor(false)).toEqual([]);
    expect(moreGroupsFor(false)).toEqual([]);
  });
});

describe("moreGroupsFor", () => {
  it("has the rail's other sections, Settings, and the help pages", () => {
    expect(moreGroupsFor(true).map((group) => group.map((item) => item.href))).toEqual([
      ["/movies", "/series", "/library", "/favorites"],
      ["/settings"],
      ["/changelog", "/help/errors"],
    ]);
  });
});

describe("showsPhoneTabs", () => {
  it("shows signed in, but not on sign-in or setup", () => {
    expect(showsPhoneTabs(true, "/discover")).toBe(true);
    expect(showsPhoneTabs(true, "/login")).toBe(false);
    expect(showsPhoneTabs(true, "/login/sso")).toBe(false);
    expect(showsPhoneTabs(true, "/setup")).toBe(false);
    expect(showsPhoneTabs(false, "/discover")).toBe(false);
  });
});

describe("activePhoneTab", () => {
  it.each([
    ["/", "discover"],
    ["/discover", "discover"],
    ["/discover/trending", "discover"],
    ["/search", "search"],
    ["/requests", "requests"],
    ["/calendar", "calendar"],
    ["/movies", "more"],
    ["/series", "more"],
    ["/library", "more"],
    ["/favorites", "more"],
    ["/settings/members", "more"],
    ["/changelog", "more"],
    ["/help/errors", "more"],
  ] as const)("%s lights %s", (pathname, tab) => {
    expect(activePhoneTab(pathname)).toBe(tab);
  });

  it("lights nothing on pages outside any section", () => {
    expect(activePhoneTab("/title/movie/603")).toBeNull();
    expect(activePhoneTab("/person/287")).toBeNull();
    // A prefix of a section's path isn't that section.
    expect(activePhoneTab("/searching")).toBeNull();
  });
});
