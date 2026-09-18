import { describe, expect, it } from "vitest";
import { getClientIp } from "./rate-limit";

const req = (headers: Record<string, string>) => new Request("http://marquee.local/", { headers });

describe("getClientIp", () => {
  it("uses the hop the nearest proxy appended, not the client-supplied first one", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("handles a single hop", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to X-Real-IP, then unknown", () => {
    expect(getClientIp(req({ "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
