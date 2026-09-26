import { randomBytes, timingSafeEqual } from "crypto";
import type { CoreFailure } from "@/lib/core-result";

// Sign-ins (and links) in progress with the SSO provider, in memory for the
// same reasons as Plex PINs (lib/auth/login-tickets.ts): on globalThis so
// every copy of this module in the process sees them, and a restart just
// means starting again. Each flow is known by up to three unrelated random
// secrets, each only good for one thing:
//
//  - `state`, sent to the identity provider and back on the callback. The
//    callback is only accepted from the browser the flow is bound to: the
//    `binding` secret, kept in an httpOnly cookie, must come back with it —
//    so a callback URL made by someone else (login CSRF) or a stolen one
//    can't be completed in another browser.
//  - for the apps, `appKey`, in the link the app opens in the browser. It
//    shows a "continue signing in to the app?" page; only continuing from
//    that page (a same-origin POST) binds the browser and goes on to the
//    provider.
//  - for the apps, `handle`, which only the app has: it polls with it and
//    gets the result exactly once.

export const SSO_FLOW_TTL_MS = 10 * 60 * 1000;
export const SSO_COOKIE = "marquee_sso";
export const SSO_COOKIE_PATH = "/api/auth/sso";

export const MAX_LIVE_SSO_FLOWS = 300;
export const MAX_LIVE_SSO_FLOWS_PER_OWNER = 5;
export const SHARED_SSO_OWNER = "shared";
export const MAX_LIVE_SSO_FLOWS_SHARED = 20;

export type SsoPurpose =
  | { kind: "web_sign_in"; remember: boolean }
  | { kind: "web_link"; userId: string }
  | { kind: "app_sign_in"; deviceName: string | null }
  | { kind: "app_link"; userId: string; username: string };

export type SsoFlowResult = { ok: true; userId: string } | CoreFailure;

export type SsoFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** The provider and client this flow was started against: a callback
   * after the admin changed either is refused. */
  issuer: string;
  clientId: string;
  redirectUri: string;
  purpose: SsoPurpose;
  owner: string;
  /** The browser-binding secret (the cookie's value); null until an app
   * flow is continued from its page. */
  binding: string | null;
  appKey: string | null;
  handle: string | null;
  status: "waiting" | "authorizing" | "done";
  result: SsoFlowResult | null;
  /** Where the provider's page is, once the flow is bound. */
  authUrl: string;
  expiresAt: number;
};

declare global {
  var __marqueeSsoFlows: Map<string, SsoFlow> | undefined;
  var __marqueeSsoAppKeys: Map<string, SsoFlow> | undefined;
  var __marqueeSsoHandles: Map<string, SsoFlow> | undefined;
  var __marqueeSsoSweeper: boolean | undefined;
}

const byState: Map<string, SsoFlow> = (globalThis.__marqueeSsoFlows ??= new Map());
const byAppKey: Map<string, SsoFlow> = (globalThis.__marqueeSsoAppKeys ??= new Map());
const byHandle: Map<string, SsoFlow> = (globalThis.__marqueeSsoHandles ??= new Map());

function forget(flow: SsoFlow) {
  if (byState.get(flow.state) === flow) byState.delete(flow.state);
  if (flow.appKey && byAppKey.get(flow.appKey) === flow) byAppKey.delete(flow.appKey);
  if (flow.handle && byHandle.get(flow.handle) === flow) byHandle.delete(flow.handle);
}

function sweep(now = Date.now()) {
  for (const map of [byState, byAppKey, byHandle]) {
    for (const flow of map.values()) if (flow.expiresAt <= now) forget(flow);
  }
}

if (!globalThis.__marqueeSsoSweeper) {
  globalThis.__marqueeSsoSweeper = true;
  setInterval(() => sweep(), 60 * 1000).unref?.();
}

function secret(): string {
  return randomBytes(32).toString("base64url");
}

/** Every live flow, whichever map still holds it. */
function liveFlows(now: number): Set<SsoFlow> {
  sweep(now);
  return new Set([...byState.values(), ...byHandle.values()]);
}

export function hasSsoCapacity(owner: string, now = Date.now()): boolean {
  let total = 0;
  let mine = 0;
  for (const flow of liveFlows(now)) {
    total++;
    if (flow.owner === owner) mine++;
  }
  const perOwner = owner === SHARED_SSO_OWNER ? MAX_LIVE_SSO_FLOWS_SHARED : MAX_LIVE_SSO_FLOWS_PER_OWNER;
  return total < MAX_LIVE_SSO_FLOWS && mine < perOwner;
}

export type NewFlow = Pick<
  SsoFlow,
  "state" | "nonce" | "codeVerifier" | "issuer" | "clientId" | "redirectUri" | "purpose" | "owner" | "authUrl"
>;

/** Registers a flow; null when the caps are reached. Web flows are bound
 * to the starting browser straight away (the returned `binding` goes in
 * its cookie); app flows get an `appKey` and `handle` instead. */
export function createSsoFlow(
  input: NewFlow,
  now = Date.now(),
): { flow: SsoFlow; binding: string | null } | null {
  if (!hasSsoCapacity(input.owner, now)) return null;
  const isApp = input.purpose.kind === "app_sign_in" || input.purpose.kind === "app_link";
  const binding = isApp ? null : secret();
  const flow: SsoFlow = {
    ...input,
    binding,
    appKey: isApp ? secret() : null,
    handle: isApp ? secret() : null,
    status: isApp ? "waiting" : "authorizing",
    result: null,
    expiresAt: now + SSO_FLOW_TTL_MS,
  };
  byState.set(flow.state, flow);
  if (flow.appKey) byAppKey.set(flow.appKey, flow);
  if (flow.handle) byHandle.set(flow.handle, flow);
  return { flow, binding };
}

function live(flow: SsoFlow | undefined, now: number): SsoFlow | null {
  if (!flow) return null;
  if (flow.expiresAt <= now) {
    forget(flow);
    return null;
  }
  return flow;
}

/** An app flow waiting on its "continue?" page. */
export function getAppFlow(appKey: unknown, now = Date.now()): SsoFlow | null {
  if (typeof appKey !== "string" || !appKey || appKey.length > 128) return null;
  const flow = live(byAppKey.get(appKey), now);
  return flow && flow.status !== "done" ? flow : null;
}

/** Binds an app flow to the browser that continued it (a fresh binding
 * each time, so only the latest continue can finish). */
export function bindAppFlow(appKey: unknown, now = Date.now()): { flow: SsoFlow; binding: string } | null {
  const flow = getAppFlow(appKey, now);
  if (!flow) return null;
  const binding = secret();
  flow.binding = binding;
  flow.status = "authorizing";
  return { flow, binding };
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type CallbackLookup =
  | { status: "ok"; flow: SsoFlow }
  /** Unknown, used or timed out. */
  | { status: "expired" }
  /** A live flow, but not this browser's: left alone, since its owner may
   * still finish it. */
  | { status: "wrong_browser" };

/** The flow a callback is for, taken out of play (its `state` can't be used
 * again) when — and only when — the browser's cookie matches. */
export function takeFlowForCallback(state: unknown, cookie: unknown, now = Date.now()): CallbackLookup {
  if (typeof state !== "string" || !state || state.length > 128) return { status: "expired" };
  const flow = live(byState.get(state), now);
  if (!flow || flow.status !== "authorizing") return { status: "expired" };
  if (typeof cookie !== "string" || !flow.binding || !sameSecret(cookie, flow.binding)) {
    return { status: "wrong_browser" };
  }
  byState.delete(state);
  if (flow.appKey) byAppKey.delete(flow.appKey);
  return { status: "ok", flow };
}

/** Records how an app flow ended, for its next poll. Web flows are simply
 * forgotten. */
export function finishFlow(flow: SsoFlow, result: SsoFlowResult) {
  flow.status = "done";
  flow.result = result;
  if (!flow.handle) forget(flow);
}

export type HandlePoll =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "done"; flow: SsoFlow; result: SsoFlowResult };

/** One poll by an app: pending until the browser side finishes, then the
 * result exactly once. `kind` (and, for a link, the account) must be what
 * the flow was started for — anything else is "expired", like Plex handles. */
export function pollFlowHandle(
  handle: unknown,
  purpose: { kind: "app_sign_in" } | { kind: "app_link"; userId: string },
  now = Date.now(),
): HandlePoll {
  if (typeof handle !== "string" || !handle || handle.length > 128) return { status: "expired" };
  const flow = live(byHandle.get(handle), now);
  if (!flow) return { status: "expired" };
  const same =
    flow.purpose.kind === purpose.kind &&
    (purpose.kind === "app_sign_in" || (flow.purpose.kind === "app_link" && flow.purpose.userId === purpose.userId));
  if (!same) return { status: "expired" };
  if (flow.status !== "done" || !flow.result) return { status: "pending" };
  // First poll to see the result takes it.
  if (!byHandle.delete(handle)) return { status: "expired" };
  forget(flow);
  return { status: "done", flow, result: flow.result };
}

/** Forgets the unfinished browser flow a cookie still points at: starting
 * again in the same browser replaces it (only one cookie, so only the
 * newest could finish anyway), and doesn't use up another slot. */
export function dropBrowserFlow(cookie: unknown) {
  if (typeof cookie !== "string" || !cookie) return;
  for (const flow of byState.values()) {
    if (!flow.handle && flow.binding && sameSecret(cookie, flow.binding)) forget(flow);
  }
}

/** For tests. */
export function resetSsoFlows() {
  byState.clear();
  byAppKey.clear();
  byHandle.clear();
}
