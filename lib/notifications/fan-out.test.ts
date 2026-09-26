import { beforeEach, describe, expect, it, vi } from "vitest";

// Routing: which household and personal channels a notification reaches,
// with every sender and the database stubbed.

const household = vi.hoisted(() => ({
  discord: null as string | null,
  ntfy: null as string | null,
  webhook: null as string | null,
  telegram: null as { botToken: string; chatId: string } | null,
  pushover: null as { appToken: string; userKey: string } | null,
  email: null as { to: string[] } | null,
  events: null as string[] | null,
}));
const sent = vi.hoisted(() => ({ household: [] as string[], personal: [] as string[] }));
const personalChannels = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("@/lib/integrations/app-settings", () => ({
  getDiscordWebhookUrl: async () => household.discord,
  getNtfyUrl: async () => household.ntfy,
  getGenericWebhookUrl: async () => household.webhook,
}));
vi.mock("@/lib/notifications/channels", () => ({
  getChannelConfig: async (kind: "telegram" | "pushover" | "email") => household[kind],
}));
vi.mock("@/lib/discord/client", () => ({ sendDiscordMessage: async () => void sent.household.push("discord") }));
vi.mock("@/lib/ntfy/client", () => ({ sendNtfyMessage: async () => void sent.household.push("ntfy") }));
vi.mock("@/lib/webhook/client", () => ({ sendWebhookNotification: async () => void sent.household.push("webhook") }));
vi.mock("@/lib/telegram/client", () => ({ sendTelegramMessage: async () => void sent.household.push("telegram") }));
vi.mock("@/lib/pushover/client", () => ({ sendPushoverMessage: async () => void sent.household.push("pushover") }));
vi.mock("@/lib/email/client", () => ({ sendEmail: async () => void sent.household.push("email"), isEmailAddress: () => true }));
vi.mock("@/lib/notifications/preferences", async () => {
  const { householdWants } = await import("./events");
  return {
    householdPostsEvent: async (event: Parameters<typeof householdWants>[1]) => householdWants(household.events, event),
    roleOf: async () => "member",
  };
});
vi.mock("@/lib/notifications/personal", () => ({
  deliverableChannels: async () => personalChannels.list,
  deliverToChannel: async (channel: { row: { id: string } }, _message: unknown, actor: { id: string }) => {
    sent.personal.push(`${actor.id}:${channel.row.id}`);
    return true;
  },
}));

import { fanOut, personalTargets } from "./fan-out";
import { destinationKey, type PersonalChannelConfig } from "./personal-config";

function channel(id: string, config: PersonalChannelConfig, events: Record<string, boolean> = {}) {
  return { row: { id, events } as never, config, key: destinationKey(config, "https://ntfy.example.com") };
}

const approved = {
  userId: "anna",
  eventType: "request_approved" as const,
  event: "request_approved" as const,
  title: "Dune",
  message: "“Dune” was approved",
  mediaType: "movie",
  tmdbId: 438631,
};

beforeEach(() => {
  Object.assign(household, { discord: null, ntfy: null, webhook: null, telegram: null, pushover: null, email: null, events: null });
  sent.household = [];
  sent.personal = [];
  personalChannels.list = [];
});

describe("fanOut", () => {
  it("relays to every household channel that's set up, as before", async () => {
    household.discord = "https://discord.com/api/webhooks/1/household";
    household.telegram = { botToken: "t", chatId: "-100" };
    household.email = { to: ["family@example.com"] };
    await fanOut(approved, true);
    expect(sent.household.sort()).toEqual(["discord", "email", "telegram"]);
  });

  it("doesn't relay a copy marked not to, or an event the admin turned off", async () => {
    household.discord = "https://discord.com/api/webhooks/1/household";
    await fanOut(approved, false);
    expect(sent.household).toEqual([]);
    household.events = ["request_available"];
    await fanOut(approved, true);
    expect(sent.household).toEqual([]);
    // "Your problem is fixed" was never relayed, and still isn't by default.
    household.events = null;
    await fanOut({ ...approved, eventType: "issue_resolved", event: "issue_updated" }, true);
    expect(sent.household).toEqual([]);
  });

  it("sends to the account's own channels that want the event, even for an unrelayed copy", async () => {
    personalChannels.list = [
      channel("tg", { kind: "telegram", chatId: "42" }),
      channel("mail", { kind: "email", address: "anna@example.com" }, { request_approved: false }),
      channel("hook", { kind: "webhook", url: "https://hooks.example.com/a" }),
    ];
    await fanOut(approved, false);
    expect(sent.personal.sort()).toEqual(["anna:hook", "anna:tg"]);
  });

  it("keeps 'started downloading' off personal channels unless chosen", async () => {
    personalChannels.list = [
      channel("tg", { kind: "telegram", chatId: "42" }),
      channel("hook", { kind: "webhook", url: "https://hooks.example.com/a" }, { request_downloading: true }),
    ];
    await fanOut({ ...approved, eventType: "grabbed", event: "request_downloading" }, false);
    expect(sent.personal).toEqual(["anna:hook"]);
  });

  it("doesn't send a personal copy to a place the household channel just posted to", async () => {
    household.telegram = { botToken: "t", chatId: "42" };
    household.email = { to: ["anna@example.com", "ben@example.com"] };
    household.ntfy = "https://ntfy.example.com/family";
    personalChannels.list = [
      channel("tg", { kind: "telegram", chatId: "42" }),
      channel("mail", { kind: "email", address: "Anna@example.com" }),
      channel("ntfy", { kind: "ntfy", topic: "family" }),
      channel("own-ntfy", { kind: "ntfy", topic: "anna-only" }),
    ];
    await fanOut(approved, true);
    expect(sent.personal).toEqual(["anna:own-ntfy"]);
    // …but when this copy isn't relayed, those channels are the only way it arrives.
    sent.personal = [];
    await fanOut(approved, false);
    expect(sent.personal.sort()).toEqual(["anna:mail", "anna:ntfy", "anna:own-ntfy", "anna:tg"]);
  });
});

describe("personalTargets", () => {
  it("sends once to a place listed twice", () => {
    const a = channel("a", { kind: "webhook", url: "https://hooks.example.com/x" });
    const b = channel("b", { kind: "webhook", url: "https://hooks.example.com/x" });
    expect(personalTargets([a, b], "request_approved", new Set()).map((c) => c.row.id)).toEqual(["a"]);
  });
});
