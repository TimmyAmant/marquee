import { describe, expect, it } from "vitest";
import {
  canDeleteComment,
  canEditComment,
  commentSnippet,
  COMMENT_EDIT_WINDOW_MS,
  MAX_COMMENT_LENGTH,
  sanitizeComment,
} from "./text";

describe("sanitizeComment", () => {
  it("keeps plain text, trims it, and tidies line breaks", () => {
    expect(sanitizeComment("  Hi there  ")).toEqual({ ok: true, body: "Hi there" });
    expect(sanitizeComment("one\r\ntwo\rthree")).toEqual({ ok: true, body: "one\ntwo\nthree" });
    expect(sanitizeComment("a   \n\n\n\n\nb")).toEqual({ ok: true, body: "a\n\nb" });
    expect(sanitizeComment("<b>bold</b> & co")).toEqual({ ok: true, body: "<b>bold</b> & co" });
  });

  it("drops control and direction-override characters", () => {
    expect(sanitizeComment("a\u0000b\u0007c‮d⁦e\tf")).toEqual({ ok: true, body: "abcde\tf" });
  });

  it("refuses nothing, non-text, and too much", () => {
    expect(sanitizeComment("   \n ")).toMatchObject({ ok: false, error: "Write something first." });
    expect(sanitizeComment(42)).toMatchObject({ ok: false });
    expect(sanitizeComment(undefined)).toMatchObject({ ok: false });
    expect(sanitizeComment("x".repeat(MAX_COMMENT_LENGTH))).toMatchObject({ ok: true });
    expect(sanitizeComment("x".repeat(MAX_COMMENT_LENGTH + 1))).toMatchObject({ ok: false });
  });
});

describe("editing and deleting", () => {
  const createdAt = new Date("2026-09-26T12:00:00Z");
  const comment = { authorUserId: "anna", createdAt };
  const inWindow = new Date(createdAt.getTime() + COMMENT_EDIT_WINDOW_MS - 1);
  const late = new Date(createdAt.getTime() + COMMENT_EDIT_WINDOW_MS + 1);

  it("lets the author edit and delete for a short while only", () => {
    expect(canEditComment(comment, "anna", inWindow)).toBe(true);
    expect(canEditComment(comment, "anna", late)).toBe(false);
    expect(canEditComment(comment, "ben", inWindow)).toBe(false);
    expect(canDeleteComment(comment, { userId: "anna", role: "member" }, inWindow)).toBe(true);
    expect(canDeleteComment(comment, { userId: "anna", role: "member" }, late)).toBe(false);
  });

  it("lets the admin delete any, any time, but not edit it", () => {
    expect(canDeleteComment(comment, { userId: "boss", role: "admin" }, late)).toBe(true);
    expect(canDeleteComment(comment, { userId: "tess", role: "trusted" }, inWindow)).toBe(false);
    expect(canEditComment(comment, "boss", inWindow)).toBe(false);
  });
});

describe("commentSnippet", () => {
  it("is one line, cut at a word", () => {
    expect(commentSnippet("Short\nand sweet")).toBe("Short and sweet");
    const long = "Could you get the 4K one instead? The regular copy is fine but my new TV would really show it off";
    const snippet = commentSnippet(long, 40);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(41);
    expect(long.startsWith(snippet.slice(0, -1))).toBe(true);
  });
});
