import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import {
  LEGACY_SETTINGS_REDIRECTS,
  NOTIFICATION_SUB_TABS,
  SETTINGS_TABS,
  isNotificationAgent,
  settingsTabForPath,
  visibleNotificationSubTabs,
  visibleSettingsTabs,
} from "./tabs";

const admin = { isAdmin: true, canManageBlocklist: true };
const member = { isAdmin: false, canManageBlocklist: false };
const blocklistMember = { isAdmin: false, canManageBlocklist: true };

const ids = (viewer: typeof admin) => visibleSettingsTabs(viewer).map((tab) => tab.id);

describe("Settings' tabs", () => {
  it("come in the same order as the Mac and Windows apps", () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual([
      "account",
      "general",
      "members",
      "media-servers",
      "services",
      "notifications",
      "discover",
      "blocklist",
      "jobs",
      "activity",
      "about",
    ]);
  });

  it("gives the admin every tab", () => {
    expect(ids(admin)).toEqual(SETTINGS_TABS.map((tab) => tab.id));
  });

  it("gives a member only their own tabs", () => {
    expect(ids(member)).toEqual(["account", "notifications", "about"]);
  });

  it("adds the blocklist for a member who was handed it, and nothing else of the admin's", () => {
    expect(ids(blocklistMember)).toEqual(["account", "notifications", "blocklist", "about"]);
  });

  it("each has a page", () => {
    for (const tab of SETTINGS_TABS) {
      const dir = path.join(process.cwd(), "app", tab.href.replace(/^\//, ""));
      expect(existsSync(path.join(dir, "page.tsx")), tab.href).toBe(true);
    }
  });

  it("lights the tab a page belongs to", () => {
    expect(settingsTabForPath("/settings")?.id).toBe("account");
    expect(settingsTabForPath("/settings/")?.id).toBe("account");
    expect(settingsTabForPath("/settings/services")?.id).toBe("services");
    expect(settingsTabForPath("/settings/notifications/discord")?.id).toBe("notifications");
    expect(settingsTabForPath("/settings/general/import-seerr")?.id).toBe("general");
    // Account is /settings itself, not everything under it.
    expect(settingsTabForPath("/settings/unknown")).toBeUndefined();
  });

  it("lights nothing a member can't see", () => {
    expect(settingsTabForPath("/settings/services", visibleSettingsTabs(member))).toBeUndefined();
  });
});

describe("Notifications' sub-tabs", () => {
  it("are yours, then one per household channel for the admin", () => {
    expect(visibleNotificationSubTabs(true).map((tab) => tab.id)).toEqual([
      "personal",
      "household",
      "discord",
      "ntfy",
      "telegram",
      "pushover",
      "email",
      "webhook",
    ]);
  });

  it("are only yours for a member", () => {
    expect(visibleNotificationSubTabs(false).map((tab) => tab.id)).toEqual(["personal"]);
  });

  it("know which agents exist", () => {
    for (const tab of NOTIFICATION_SUB_TABS.filter((tab) => tab.adminOnly)) {
      expect(isNotificationAgent(tab.id)).toBe(true);
      expect(tab.href).toBe(`/settings/notifications/${tab.id}`);
    }
    expect(isNotificationAgent("personal")).toBe(false);
    expect(isNotificationAgent("slack")).toBe(false);
  });
});

describe("the old Settings addresses", () => {
  it("redirect to where each page went", async () => {
    const redirects = await nextConfig.redirects!();
    const find = (source: string) => redirects.find((entry) => entry.source === source);
    expect(find("/settings/integrations")).toMatchObject({ destination: "/settings/media-servers", permanent: false });
    // The Mac and Windows apps open the importer here.
    expect(find("/settings/integrations/import-seerr")).toMatchObject({
      destination: "/settings/general/import-seerr",
      permanent: false,
    });
  });

  it("have no page of their own left behind, and every destination has one", () => {
    for (const entry of LEGACY_SETTINGS_REDIRECTS) {
      const source = path.join(process.cwd(), "app", entry.source.replace(/^\//, ""), "page.tsx");
      const destination = path.join(process.cwd(), "app", entry.destination.replace(/^\//, ""), "page.tsx");
      expect(existsSync(source), entry.source).toBe(false);
      expect(existsSync(destination), entry.destination).toBe(true);
    }
  });

  it("keep the server actions where the forms import them", () => {
    expect(readdirSync(path.join(process.cwd(), "app/settings/integrations"))).toContain("arr-server-actions.ts");
  });
});
