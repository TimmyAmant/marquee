import { describe, expect, it } from "vitest";
import { encodeHeaderValue } from "./client";

describe("encodeHeaderValue", () => {
  it("leaves plain titles alone", () => {
    expect(encodeHeaderValue("The Matrix")).toBe("The Matrix");
  });

  it("wraps accented titles so ntfy reads them as UTF-8", () => {
    expect(encodeHeaderValue("Amélie")).toBe(`=?UTF-8?B?${Buffer.from("Amélie").toString("base64")}?=`);
  });

  it("wraps non-Latin-1 titles so fetch accepts them", () => {
    const encoded = encodeHeaderValue("千と千尋の神隠し");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(() => new Headers({ Title: encoded })).not.toThrow();
    const b64 = encoded.slice("=?UTF-8?B?".length, -2);
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe("千と千尋の神隠し");
  });

  it("wraps emoji", () => {
    expect(encodeHeaderValue("Movie 🎬").startsWith("=?UTF-8?B?")).toBe(true);
  });
});
