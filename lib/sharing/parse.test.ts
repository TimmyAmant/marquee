import { describe, expect, it } from "vitest";
import {
  cleanShareNote,
  MAX_SHARE_RECIPIENTS,
  marqueeUrl,
  outsideShareTargets,
  parseRecipients,
  publicTitleLinks,
  shareMessage,
} from "./parse";

const ME = "11111111-1111-4111-8111-111111111111";
const KID = "33333333-3333-4333-8333-333333333333";
const GRAN = "44444444-4444-4444-8444-444444444444";

describe("parseRecipients", () => {
  it("takes account ids, once each", () => {
    expect(parseRecipients([KID, GRAN, KID.toUpperCase()], ME)).toEqual({ ok: true, userIds: [KID, GRAN] });
  });

  it("wants at least one real-looking id", () => {
    for (const raw of [undefined, null, [], "33333333-3333-4333-8333-333333333333", [42], ["kid"], [KID, ""]]) {
      expect(parseRecipients(raw, ME)).toEqual({ ok: false, error: "Pick who to share it with." });
    }
  });

  it("won't send to the sharer", () => {
    expect(parseRecipients([KID, ME], ME)).toEqual({ ok: false, error: "You can't share with yourself." });
    expect(parseRecipients([ME.toUpperCase()], ME)).toMatchObject({ ok: false });
  });

  it("caps how many at once", () => {
    const many = Array.from({ length: MAX_SHARE_RECIPIENTS + 1 }, (_, i) =>
      `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
    );
    expect(parseRecipients(many, ME)).toMatchObject({ ok: false, error: expect.stringMatching(/at most 20/) });
    expect(parseRecipients(many.slice(1), ME)).toMatchObject({ ok: true });
  });
});

describe("cleanShareNote", () => {
  it("is optional", () => {
    expect(cleanShareNote(undefined)).toEqual({ ok: true, note: null });
    expect(cleanShareNote(null)).toEqual({ ok: true, note: null });
    expect(cleanShareNote("   \n  ")).toEqual({ ok: true, note: null });
  });

  it("keeps it plain text on one line", () => {
    expect(cleanShareNote("  You'd <b>love</b>\nthis   one  ")).toEqual({ ok: true, note: "You'd love this one" });
    expect(cleanShareNote('<img src=x onerror="alert(1)">Watch it')).toEqual({ ok: true, note: "Watch it" });
    expect(cleanShareNote("<script>alert(1)</script>")).toEqual({ ok: true, note: "alert(1)" });
  });

  it("leaves text that only looks a bit like markup", () => {
    expect(cleanShareNote("3 < 4 and 5 > 2")).toEqual({ ok: true, note: "3 < 4 and 5 > 2" });
    expect(cleanShareNote("<3 this")).toEqual({ ok: true, note: "<3 this" });
  });

  it("drops control, direction-override and zero-width characters, not emoji", () => {
    expect(cleanShareNote("a\u0000b\u0007c\u202Etxt.exe\u200B")).toEqual({ ok: true, note: "abctxt.exe" });
    expect(cleanShareNote("family 👨\u200D👩\u200D👧 night")).toEqual({ ok: true, note: "family 👨\u200D👩\u200D👧 night" });
  });

  it("counts characters, not UTF-16 units, up to 280", () => {
    expect(cleanShareNote("🍿".repeat(280))).toMatchObject({ ok: true });
    expect(cleanShareNote("a".repeat(281))).toEqual({ ok: false, error: "Keep the note under 280 characters." });
    // Whitespace that collapses doesn't count against it.
    expect(cleanShareNote(`${"a".repeat(140)}${" ".repeat(400)}${"b".repeat(139)}`)).toMatchObject({ ok: true });
  });

  it("wants text", () => {
    expect(cleanShareNote(42)).toEqual({ ok: false, error: "The note has to be text." });
    expect(cleanShareNote({ html: "<b>" })).toMatchObject({ ok: false });
  });
});

describe("messages and links", () => {
  it("words the notification", () => {
    expect(shareMessage("Susan", "Ice Age", null)).toBe("Susan shared “Ice Age” with you");
    expect(shareMessage("Susan", "Ice Age", "You'd love this")).toBe("Susan shared “Ice Age” with you: You'd love this");
  });

  it("builds the Marquee and public links", () => {
    expect(marqueeUrl("https://marquee.example.com/", "/title/movie/425")).toBe(
      "https://marquee.example.com/title/movie/425",
    );
    expect(publicTitleLinks("movie", 425, "tt0268380")).toEqual({
      tmdb: "https://www.themoviedb.org/movie/425",
      imdb: "https://www.imdb.com/title/tt0268380/",
    });
    expect(publicTitleLinks("tv", 1396, null)).toEqual({ tmdb: "https://www.themoviedb.org/tv/1396", imdb: null });
    expect(publicTitleLinks("tv", 1396, "javascript:alert(1)").imdb).toBeNull();
  });

  it("encodes the quick links", () => {
    const targets = outsideShareTargets("Ice Age & more", "https://m.example.com/title/movie/425?x=1");
    expect(targets.sms).toBe(
      "sms:?&body=Ice%20Age%20%26%20more%20https%3A%2F%2Fm.example.com%2Ftitle%2Fmovie%2F425%3Fx%3D1",
    );
    expect(targets.email.startsWith("mailto:?subject=Ice%20Age%20%26%20more&body=")).toBe(true);
    expect(targets.whatsapp.startsWith("https://wa.me/?text=")).toBe(true);
    expect(targets.messenger).toBe("fb-messenger://share/?link=https%3A%2F%2Fm.example.com%2Ftitle%2Fmovie%2F425%3Fx%3D1");
  });
});
