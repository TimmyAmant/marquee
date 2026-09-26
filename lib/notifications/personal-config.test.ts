import { describe, expect, it, vi } from "vitest";

vi.mock("nodemailer", () => ({ default: { createTransport: () => ({}) } }));

import { destinationKey, maskedTarget, ntfyServerOf, parsePersonalConfig, type ConfigContext } from "./personal-config";

const member: ConfigContext = { ntfyServer: "https://ntfy.example.com", policy: { allowPrivate: false } };
const noNtfy: ConfigContext = { ntfyServer: null, policy: { allowPrivate: false } };

const DISCORD = "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_secret";
const PUSHOVER = "uQiRzpo4DXghDmr9QzzfQu27cmVRsG";

describe("parsePersonalConfig", () => {
  it("takes each kind's details", () => {
    expect(parsePersonalConfig("telegram", { chatId: " 123456789 " }, null, member)).toEqual({
      ok: true,
      config: { kind: "telegram", chatId: "123456789" },
    });
    expect(parsePersonalConfig("pushover", { userKey: PUSHOVER }, null, member)).toMatchObject({ ok: true });
    expect(parsePersonalConfig("email", { address: " Anna@Example.com " }, null, member)).toEqual({
      ok: true,
      config: { kind: "email", address: "anna@example.com" },
    });
    expect(parsePersonalConfig("discord", { webhookUrl: DISCORD }, null, member)).toMatchObject({ ok: true });
    expect(parsePersonalConfig("ntfy", { topic: "anna-films" }, null, member)).toEqual({
      ok: true,
      config: { kind: "ntfy", topic: "anna-films" },
    });
    expect(parsePersonalConfig("ntfy", { url: "https://ntfy.sh/anna" }, null, noNtfy)).toEqual({
      ok: true,
      config: { kind: "ntfy", url: "https://ntfy.sh/anna" },
    });
    expect(parsePersonalConfig("webhook", { url: "https://hooks.example.com/x" }, null, member)).toMatchObject({ ok: true });
  });

  it("refuses what isn't right", () => {
    // A group or channel is the household's business; your own chat is a positive id.
    expect(parsePersonalConfig("telegram", { chatId: "-100123" }, null, member).ok).toBe(false);
    expect(parsePersonalConfig("telegram", { chatId: "@channel" }, null, member).ok).toBe(false);
    expect(parsePersonalConfig("pushover", { userKey: "short" }, null, member).ok).toBe(false);
    expect(parsePersonalConfig("email", { address: "anna" }, null, member).ok).toBe(false);
    expect(parsePersonalConfig("email", { address: "a@b.com\r\nBcc: x@y.com" }, null, member).ok).toBe(false);
    // Only Discord's own address: a "Discord webhook" can't be pointed anywhere else.
    expect(parsePersonalConfig("discord", { webhookUrl: "https://evil.example/api/webhooks/1/abc" }, null, member).ok).toBe(false);
    expect(parsePersonalConfig("discord", { webhookUrl: "http://discord.com/api/webhooks/123456/abcdefghijklmnopqrstuv" }, null, member).ok).toBe(false);
    expect(parsePersonalConfig("ntfy", { topic: "../admin" }, null, member).ok).toBe(false);
    expect(parsePersonalConfig("ntfy", { topic: "anna" }, null, noNtfy).ok).toBe(false);
    expect(parsePersonalConfig("webhook", { url: "http://192.168.1.5/hook" }, null, member)).toEqual({
      ok: false,
      error: expect.stringMatching(/home network/),
    });
    expect(parsePersonalConfig("ntfy", { url: "http://localhost:81/topic" }, null, member).ok).toBe(false);
  });

  it("lets the admin's own URLs reach the home network, as the household ones can", () => {
    const admin: ConfigContext = { ntfyServer: null, policy: { allowPrivate: true } };
    expect(parsePersonalConfig("webhook", { url: "http://192.168.1.5/hook" }, null, admin)).toMatchObject({ ok: true });
  });

  it("keeps a saved secret when the field is left blank", () => {
    const saved = { kind: "discord" as const, webhookUrl: DISCORD };
    expect(parsePersonalConfig("discord", { webhookUrl: "" }, saved, member)).toEqual({ ok: true, config: saved });
    const savedHook = { kind: "webhook" as const, url: "https://hooks.example.com/x" };
    expect(parsePersonalConfig("webhook", {}, savedHook, member)).toEqual({ ok: true, config: savedHook });
    // Never another kind's secret.
    expect(parsePersonalConfig("webhook", {}, saved, member).ok).toBe(false);
  });
});

describe("maskedTarget", () => {
  it("never shows the secret", () => {
    const cases = [
      { kind: "pushover" as const, userKey: PUSHOVER },
      { kind: "discord" as const, webhookUrl: DISCORD },
      { kind: "ntfy" as const, url: "https://ntfy.sh/very-secret-topic" },
      { kind: "ntfy" as const, topic: "very-secret-topic" },
      { kind: "webhook" as const, url: "https://hooks.example.com/token/abcdef123456?key=zzz" },
    ];
    for (const config of cases) {
      const shown = maskedTarget(config);
      expect(shown).not.toContain("secret");
      expect(shown).not.toContain(PUSHOVER);
      expect(shown).not.toContain("abcdef123456");
      expect(shown).not.toContain("zzz");
    }
    expect(maskedTarget({ kind: "pushover", userKey: PUSHOVER })).toBe("Key ••••RsG".replace("RsG", PUSHOVER.slice(-4)));
    expect(maskedTarget({ kind: "discord", webhookUrl: DISCORD })).toBe("Discord webhook ••••5678");
    expect(maskedTarget({ kind: "webhook", url: "https://hooks.example.com/token/abc" })).toBe("hooks.example.com/••••");
    expect(maskedTarget({ kind: "telegram", chatId: "123456789" })).toBe("Chat ••••6789");
  });

  it("shows your own email address, where the code went", () => {
    expect(maskedTarget({ kind: "email", address: "anna@example.com" })).toBe("anna@example.com");
  });
});

describe("destinationKey", () => {
  it("matches the household channel it duplicates", () => {
    const server = ntfyServerOf("https://ntfy.example.com/family");
    expect(server).toBe("https://ntfy.example.com");
    expect(destinationKey({ kind: "ntfy", topic: "family" }, server)).toBe(destinationKey({ kind: "ntfy", url: "https://ntfy.example.com/family" }, null));
    expect(destinationKey({ kind: "email", address: "Anna@Example.com" }, null)).toBe(destinationKey({ kind: "email", address: "anna@example.com" }, null));
    expect(destinationKey({ kind: "discord", webhookUrl: DISCORD.replace("discord.com", "discordapp.com") }, null)).toBe(
      destinationKey({ kind: "discord", webhookUrl: DISCORD }, null),
    );
  });

  it("finds the household ntfy server under a path", () => {
    expect(ntfyServerOf("https://example.com/ntfy/family")).toBe("https://example.com/ntfy");
    expect(ntfyServerOf(null)).toBeNull();
    expect(ntfyServerOf("not a url")).toBeNull();
  });
});
