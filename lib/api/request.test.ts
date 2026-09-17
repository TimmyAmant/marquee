import { describe, it, expect } from "vitest";
import { ApiError } from "./errors";
import { parseIdSegment, parseMediaType, parseUuidSegment, queryBool, queryInt, readJsonBody } from "./request";

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : "not-an-ApiError";
  }
}

describe("path parsing", () => {
  it("accepts positive integer ids within Postgres integer range", () => {
    expect(parseIdSegment("603")).toBe(603);
    expect(parseIdSegment("2147483647")).toBe(2147483647);
  });

  it("404s anything else", () => {
    for (const bad of ["0", "-1", "1.5", "abc", "", "2147483648", "99999999999", "1e3"]) {
      expect(codeOf(() => parseIdSegment(bad))).toBe("not_found");
    }
  });

  it("validates media types and uuids", () => {
    expect(parseMediaType("tv")).toBe("tv");
    expect(codeOf(() => parseMediaType("book"))).toBe("not_found");
    expect(parseUuidSegment("54caac33-73d6-4864-8e12-1ea6b212d2f1", "x")).toBe("54caac33-73d6-4864-8e12-1ea6b212d2f1");
    expect(codeOf(() => parseUuidSegment("not-a-uuid", "x"))).toBe("not_found");
  });
});

describe("query parsing", () => {
  const url = (qs: string) => new URL(`http://localhost/api/v1/movies?${qs}`);

  it("parses optional integers with bounds", () => {
    expect(queryInt(url(""), "page")).toBeUndefined();
    expect(queryInt(url("page=3"), "page", { min: 1 })).toBe(3);
    expect(codeOf(() => queryInt(url("page=0"), "page", { min: 1 }))).toBe("invalid");
    expect(codeOf(() => queryInt(url("page=two"), "page"))).toBe("invalid");
  });

  it("parses booleans", () => {
    expect(queryBool(url("hideOwned=0"), "hideOwned")).toBe(false);
    expect(queryBool(url("hideOwned=true"), "hideOwned")).toBe(true);
    expect(queryBool(url(""), "hideOwned")).toBeUndefined();
    expect(codeOf(() => queryBool(url("hideOwned=maybe"), "hideOwned"))).toBe("invalid");
  });
});

describe("readJsonBody", () => {
  const req = (body?: string) => new Request("http://localhost/api/v1/x", { method: "POST", body });

  it("treats an empty body as {}", async () => {
    await expect(readJsonBody(req())).resolves.toEqual({});
  });

  it("parses a JSON object", async () => {
    await expect(readJsonBody(req('{"monitored":true}'))).resolves.toEqual({ monitored: true });
  });

  it("rejects invalid JSON and non-objects with 400 invalid", async () => {
    await expect(readJsonBody(req("{nope"))).rejects.toMatchObject({ code: "invalid", status: 400 });
    await expect(readJsonBody(req("[1,2]"))).rejects.toMatchObject({ code: "invalid" });
  });
});
