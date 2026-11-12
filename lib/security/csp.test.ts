import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, createNonce } from "./csp";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

describe("contentSecurityPolicy", () => {
  it("runs only this response's scripts, and what they load", () => {
    const policy = contentSecurityPolicy("abc123", false);
    expect(directive(policy, "script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
  });

  it("allows eval only in development", () => {
    expect(directive(contentSecurityPolicy("n", true), "script-src")).toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy("n", false), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows what the app loads: TMDb images, YouTube trailers, the push worker", () => {
    const policy = contentSecurityPolicy("n", false);
    expect(directive(policy, "img-src")).toContain("https://image.tmdb.org");
    expect(directive(policy, "frame-src")).toContain("https://www.youtube.com");
    expect(directive(policy, "worker-src")).toEqual(["'self'"]);
  });

  it("never stops Marquee being embedded, or sign-in redirecting to a provider", () => {
    const policy = contentSecurityPolicy("n", false);
    expect(policy).not.toContain("frame-ancestors");
    expect(policy).not.toContain("form-action");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("is fresh every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    expect([...nonces][0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
