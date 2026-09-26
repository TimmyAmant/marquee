import { describe, expect, it, vi } from "vitest";

vi.mock("nodemailer", () => ({ default: { createTransport: () => ({}) } }));

import { telegramConfigError } from "@/lib/telegram/client";
import { pushoverConfigError } from "@/lib/pushover/client";
import { emailConfigError, parseRecipients, type EmailConfig } from "@/lib/email/client";

describe("telegramConfigError", () => {
  const botToken = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
  it("takes a BotFather token with a numeric chat id or @channel", () => {
    expect(telegramConfigError({ botToken, chatId: "123456789" })).toBeNull();
    expect(telegramConfigError({ botToken, chatId: "-1001234567890" })).toBeNull();
    expect(telegramConfigError({ botToken, chatId: "@marquee_news" })).toBeNull();
  });
  it("says what's wrong", () => {
    expect(telegramConfigError({ botToken: "", chatId: "1" })).toMatch(/token/);
    expect(telegramConfigError({ botToken: "not-a-token", chatId: "1" })).toMatch(/BotFather/);
    expect(telegramConfigError({ botToken, chatId: "" })).toMatch(/chat ID/);
    expect(telegramConfigError({ botToken, chatId: "my group" })).toMatch(/-100/);
  });
});

describe("pushoverConfigError", () => {
  const key = "azGDORePK8gMaC0QOYAMyEEuzJnyUi";
  it("takes two 30-character keys", () => {
    expect(pushoverConfigError({ appToken: key, userKey: key })).toBeNull();
  });
  it("names the one that's wrong", () => {
    expect(pushoverConfigError({ appToken: "short", userKey: key })).toMatch(/application token/);
    expect(pushoverConfigError({ appToken: key, userKey: "short" })).toMatch(/user key/);
  });
});

describe("email settings", () => {
  const base: EmailConfig = {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    username: "me",
    password: "secret",
    from: "marquee@example.com",
    to: ["a@example.com"],
  };
  it("splits recipients on commas, semicolons and spaces, once each", () => {
    expect(parseRecipients("a@x.com, b@y.com;c@z.com  a@x.com")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
    expect(parseRecipients("  ")).toEqual([]);
  });
  it("accepts a complete setup, with or without a login", () => {
    expect(emailConfigError(base)).toBeNull();
    expect(emailConfigError({ ...base, username: null, password: null })).toBeNull();
  });
  it("says what's missing", () => {
    expect(emailConfigError({ ...base, host: "" })).toMatch(/host/);
    expect(emailConfigError({ ...base, host: "https://smtp.example.com" })).toMatch(/host/);
    expect(emailConfigError({ ...base, port: 0 })).toMatch(/port/);
    expect(emailConfigError({ ...base, password: null })).toMatch(/both/);
    expect(emailConfigError({ ...base, from: "Marquee" })).toMatch(/come from/);
    expect(emailConfigError({ ...base, to: [] })).toMatch(/at least one/);
    expect(emailConfigError({ ...base, to: ["a@example.com", "bob"] })).toMatch(/"bob"/);
    // One "address" holding several can't get past the limit of 20.
    expect(emailConfigError({ ...base, to: ["a@example.com,b@example.com"] })).toMatch(/isn't an email/);
  });
});
