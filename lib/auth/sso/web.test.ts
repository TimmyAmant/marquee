import { describe, expect, it } from "vitest";
import { isPublicHost, isSameOriginPost, requestHost, ssoCookieOptions } from "./web";
import { parseSsoErrorCode, ssoErrorMessage } from "./messages";

const h = (values: Record<string, string>) => new Headers(values);

describe("request host", () => {
  it("prefers the proxy's forwarded host", () => {
    expect(requestHost(h({ host: "10.0.0.2:3000", "x-forwarded-host": "Marquee.Example.com, proxy" }))).toBe("marquee.example.com");
    expect(requestHost(h({ host: "localhost:3000" }))).toBe("localhost:3000");
  });

  it("matches the public address by host only", () => {
    expect(isPublicHost("https://marquee.example.com", h({ host: "marquee.example.com" }))).toBe(true);
    expect(isPublicHost("https://marquee.example.com", h({ host: "192.168.1.5:3000" }))).toBe(false);
    expect(isPublicHost("http://localhost:3100", h({ host: "localhost:3100" }))).toBe(true);
  });
});

describe("isSameOriginPost", () => {
  it("accepts Marquee's own forms only", () => {
    expect(isSameOriginPost(h({ "sec-fetch-site": "same-origin", host: "m.test" }))).toBe(true);
    expect(isSameOriginPost(h({ "sec-fetch-site": "cross-site", host: "m.test", origin: "https://m.test" }))).toBe(false);
    expect(isSameOriginPost(h({ "sec-fetch-site": "same-site", host: "m.test" }))).toBe(false);
    expect(isSameOriginPost(h({ origin: "https://m.test", host: "m.test" }))).toBe(true);
    expect(isSameOriginPost(h({ origin: "https://evil.test", host: "m.test" }))).toBe(false);
    expect(isSameOriginPost(h({ host: "m.test" }))).toBe(false);
  });
});

describe("cookie", () => {
  it("is httpOnly, Lax, scoped to the SSO routes, and Secure on https", () => {
    expect(ssoCookieOptions("https://m.test")).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/api/auth/sso" });
    expect(ssoCookieOptions("http://m.test").secure).toBe(false);
  });
});

describe("messages", () => {
  it("only turns known codes into words", () => {
    expect(parseSsoErrorCode("no_account")).toBe("no_account");
    expect(parseSsoErrorCode("<script>")).toBeNull();
    expect(parseSsoErrorCode(["no_account"])).toBeNull();
    expect(ssoErrorMessage("no_account", "Authentik")).toContain("Authentik");
  });
});
