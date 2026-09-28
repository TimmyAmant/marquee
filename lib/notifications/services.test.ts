import { describe, expect, it } from "vitest";
import {
  gotifyRequest,
  maskedService,
  parseGotify,
  parsePushbullet,
  parseSlack,
  pushbulletRequest,
  slackRequest,
} from "@/lib/notifications/services";
import { destinationKey, maskedTarget, parsePersonalConfig } from "@/lib/notifications/personal-config";
import { englishT } from "@/lib/i18n/catalog";

const household = { allowPrivate: true };
const member = { allowPrivate: false };

describe("Gotify", () => {
  it("takes a server, a token and a priority", () => {
    expect(parseGotify({ url: "http://gotify.lan/", appToken: "AbCdEf123456", priority: "8" }, null, household)).toEqual({
      ok: true,
      config: { url: "http://gotify.lan", appToken: "AbCdEf123456", priority: 8 },
    });
    expect(parseGotify({ url: "https://push.example.com", appToken: "AbCdEf123456" }, null, member)).toMatchObject({
      ok: true,
      config: { priority: 5 },
    });
  });

  it("keeps the saved token for the same server only", () => {
    const saved = { url: "http://gotify.lan", appToken: "SavedToken123", priority: 5 };
    expect(parseGotify({ url: "http://gotify.lan" }, saved, household)).toMatchObject({ ok: true, config: { appToken: "SavedToken123" } });
    expect(parseGotify({ url: "http://other.lan" }, saved, household).ok).toBe(false);
  });

  it("refuses a member's address on the home network, a bad token or priority", () => {
    expect(parseGotify({ url: "http://192.168.1.2", appToken: "AbCdEf123456" }, null, member).ok).toBe(false);
    expect(parseGotify({ url: "https://push.example.com", appToken: "short" }, null, member).ok).toBe(false);
    expect(parseGotify({ url: "https://push.example.com", appToken: "AbCdEf123456", priority: 11 }, null, member).ok).toBe(false);
  });

  it("posts with the token in a header", () => {
    const request = gotifyRequest({ url: "http://gotify.lan", appToken: "tok", priority: 5 }, "Dune", "Ready");
    expect(request.url).toBe("http://gotify.lan/message");
    expect(request.headers["X-Gotify-Key"]).toBe("tok");
    expect(JSON.parse(request.body)).toEqual({ title: "Dune", message: "Ready", priority: 5 });
  });
});

describe("Slack", () => {
  it("takes an incoming webhook and posts plain text", () => {
    const parsed = parseSlack({ webhookUrl: "https://hooks.slack.com/services/T/B/X" }, null, member);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const request = slackRequest(parsed.config, "✅ Dune <!channel> is ready");
    expect(request.url).toBe("https://hooks.slack.com/services/T/B/X");
    expect(JSON.parse(request.body).text).toBe("✅ Dune  is ready");
    expect(parseSlack({}, null, member).ok).toBe(false);
  });
});

describe("Pushbullet", () => {
  it("takes a token and an optional channel", () => {
    expect(parsePushbullet({ accessToken: "o.abcdefghijklmnopqrstuvwxyz", channelTag: "family" }, null)).toEqual({
      ok: true,
      config: { accessToken: "o.abcdefghijklmnopqrstuvwxyz", channelTag: "family" },
    });
    expect(parsePushbullet({ accessToken: "short" }, null).ok).toBe(false);
    expect(parsePushbullet({ accessToken: "o.abcdefghijklmnopqrstuvwxyz", channelTag: "no spaces" }, null).ok).toBe(false);
  });

  it("pushes a note to its API", () => {
    const request = pushbulletRequest({ accessToken: "tok", channelTag: null }, "Dune", "Ready");
    expect(request.url).toBe("https://api.pushbullet.com/v2/pushes");
    expect(request.headers["Access-Token"]).toBe("tok");
    expect(JSON.parse(request.body)).toEqual({ type: "note", title: "Dune", body: "Ready" });
  });
});

describe("as someone's own channels", () => {
  const context = { ntfyServer: null, policy: member, t: englishT() };

  it("parses, masks and names where each sends", () => {
    const gotify = parsePersonalConfig("gotify", { url: "https://push.example.com", appToken: "AbCdEf123456" }, null, context);
    expect(gotify.ok).toBe(true);
    if (!gotify.ok) return;
    expect(maskedTarget(gotify.config)).toBe("push.example.com · ••••");
    expect(maskedTarget(gotify.config)).not.toContain("AbCdEf");
    expect(destinationKey(gotify.config, null)).toBe("gotify:https://push.example.com#AbCdEf123456");
    const pushbullet = parsePersonalConfig("pushbullet", { accessToken: "o.abcdefghijklmnopqrstuvwxyz" }, null, context);
    expect(pushbullet.ok && maskedTarget(pushbullet.config)).toBe("Pushbullet ••••wxyz");
    expect(maskedService("slack", { webhookUrl: "https://hooks.slack.com/services/T/B/X" })).toBe("hooks.slack.com/••••");
  });
});
