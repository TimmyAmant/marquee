import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateWithQuickConnect,
  checkQuickConnect,
  initiateQuickConnect,
  parseQuickConnectResult,
  QuickConnectUnavailable,
} from "./quick-connect";

const BASE = "http://jellyfin.lan:8096/";

type Call = { url: string; method: string; headers: Headers; body?: string };

/** A pretend Jellyfin 10.9+ answering Quick Connect's endpoints. */
function fakeJellyfin(options: { enabled?: boolean; getOnlyInitiate?: boolean; approved?: boolean; disabledUser?: boolean } = {}) {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    calls.push({ url: input, method, headers: new Headers(init.headers), body: init.body as string | undefined });
    if (url.pathname === "/QuickConnect/Enabled") return json(options.enabled ?? true);
    if (url.pathname === "/QuickConnect/Initiate") {
      if (options.getOnlyInitiate && method !== "GET") return new Response(null, { status: 405 });
      return json({ Secret: "s3cr3t", Code: "482915", Authenticated: false });
    }
    if (url.pathname === "/QuickConnect/Connect") {
      if (url.searchParams.get("secret") !== "s3cr3t") return new Response(null, { status: 404 });
      return json({ Secret: "s3cr3t", Code: "482915", Authenticated: options.approved ?? false });
    }
    if (url.pathname === "/Users/AuthenticateWithQuickConnect") {
      if (!options.approved) return new Response(null, { status: 401 });
      return json({
        User: { Id: "0123456789ABCDEF0123456789ABCDEF", Name: "anna", Policy: { IsDisabled: options.disabledUser ?? false } },
        AccessToken: "session-token",
      });
    }
    if (url.pathname === "/Sessions/Logout") return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseQuickConnectResult", () => {
  it("needs a secret and a code", () => {
    expect(parseQuickConnectResult({ Secret: "s", Code: "1", Authenticated: true })).toEqual({ secret: "s", code: "1", authenticated: true });
    expect(parseQuickConnectResult({ Secret: "s" })).toBeNull();
    expect(parseQuickConnectResult(null)).toBeNull();
  });
});

describe("Quick Connect against Jellyfin", () => {
  it("starts with the MediaBrowser client header and hands back secret + code", async () => {
    const calls = fakeJellyfin();
    expect(await initiateQuickConnect(BASE, "dev-1")).toEqual({ secret: "s3cr3t", code: "482915" });
    const initiate = calls.find((c) => c.url.endsWith("/QuickConnect/Initiate"))!;
    expect(initiate.method).toBe("POST");
    expect(initiate.headers.get("authorization")).toContain('DeviceId="dev-1"');
  });

  it("falls back to GET on 10.8", async () => {
    fakeJellyfin({ getOnlyInitiate: true });
    expect(await initiateQuickConnect(BASE, "dev-1")).toMatchObject({ code: "482915" });
  });

  it("reports it switched off", async () => {
    fakeJellyfin({ enabled: false });
    await expect(initiateQuickConnect(BASE, "dev-1")).rejects.toBeInstanceOf(QuickConnectUnavailable);
  });

  it("checks approval, and forgets unknown secrets", async () => {
    fakeJellyfin({ approved: true });
    expect(await checkQuickConnect(BASE, "s3cr3t", "dev-1")).toBe(true);
    expect(await checkQuickConnect(BASE, "other", "dev-1")).toBeNull();
    fakeJellyfin({ approved: false });
    expect(await checkQuickConnect(BASE, "s3cr3t", "dev-1")).toBe(false);
  });

  it("trades an approval for the user, and logs the session out again", async () => {
    const calls = fakeJellyfin({ approved: true });
    expect(await authenticateWithQuickConnect(BASE, "s3cr3t", "dev-1")).toMatchObject({
      id: "0123456789abcdef0123456789abcdef",
      name: "anna",
    });
    const auth = calls.find((c) => c.url.endsWith("/Users/AuthenticateWithQuickConnect"))!;
    expect(JSON.parse(auth.body!)).toEqual({ Secret: "s3cr3t" });
    expect(calls.some((c) => c.url.endsWith("/Sessions/Logout"))).toBe(true);
  });

  it("refuses unapproved requests and disabled users", async () => {
    fakeJellyfin({ approved: false });
    expect(await authenticateWithQuickConnect(BASE, "s3cr3t", "dev-1")).toBeNull();
    fakeJellyfin({ approved: true, disabledUser: true });
    expect(await authenticateWithQuickConnect(BASE, "s3cr3t", "dev-1")).toBeNull();
  });
});
