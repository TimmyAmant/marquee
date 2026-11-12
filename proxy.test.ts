import { describe, expect, it, vi } from "vitest";

// proxy.ts: who gets sent to /login, and the Content-Security-Policy every
// page gets. Auth.js is stubbed so `auth(handler)` is the handler itself.

vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));

import { NextRequest } from "next/server";
import proxy, { needsSignIn } from "./proxy";

type Handler = (req: NextRequest & { auth: unknown }) => Response | undefined;

function run(path: string, signedIn: boolean) {
  const req = Object.assign(new NextRequest(`http://marquee.local${path}`), { auth: signedIn ? { user: {} } : null });
  return (proxy as unknown as Handler)(req)!;
}

describe("needsSignIn", () => {
  it("lets the public pages, sign-in, webhooks, the API and static files through", () => {
    for (const path of [
      "/",
      "/login",
      "/login/sso/mac",
      "/setup",
      "/api-docs",
      "/api/auth/session",
      "/api/webhooks/radarr/x",
      "/api/v1/titles",
      "/_next/static/chunks/a.js",
      "/favicon.ico",
      "/icon",
      "/manifest.webmanifest",
      "/sw.js",
    ]) {
      expect(needsSignIn(path), path).toBe(false);
    }
  });

  it("gates everything else, lookalike paths included", () => {
    for (const path of ["/discover", "/title/tv/1399", "/title/tv/1399.js", "/login-history", "/setup2", "/api/avatar/x"]) {
      expect(needsSignIn(path), path).toBe(true);
    }
  });
});

describe("proxy", () => {
  it("sends a signed-out visitor to /login", () => {
    const response = run("/discover", false);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://marquee.local/login");
  });

  it("gives every page its own nonce in its Content-Security-Policy", () => {
    const login = run("/login", false).headers.get("content-security-policy")!;
    const discover = run("/discover", true).headers.get("content-security-policy")!;
    const nonceOf = (policy: string) => /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonceOf(login)).toBeTruthy();
    expect(nonceOf(discover)).toBeTruthy();
    expect(nonceOf(login)).not.toBe(nonceOf(discover));
  });
});
