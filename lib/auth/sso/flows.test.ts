import { beforeEach, describe, expect, it } from "vitest";
import {
  bindAppFlow,
  createSsoFlow,
  dropBrowserFlow,
  finishFlow,
  getAppFlow,
  MAX_LIVE_SSO_FLOWS_PER_OWNER,
  pollFlowHandle,
  resetSsoFlows,
  SSO_FLOW_TTL_MS,
  takeFlowForCallback,
  type NewFlow,
  type SsoPurpose,
} from "./flows";

let n = 0;
function newFlow(purpose: SsoPurpose, owner = "10.0.0.1"): NewFlow {
  n++;
  return {
    state: `state-${n}`,
    nonce: `nonce-${n}`,
    codeVerifier: `verifier-${n}`,
    issuer: "https://idp.test/",
    clientId: "marquee",
    redirectUri: "https://m.test/api/auth/sso/callback",
    purpose,
    owner,
    authUrl: `https://idp.test/authorize?state=state-${n}`,
  };
}

beforeEach(() => resetSsoFlows());

describe("browser flows", () => {
  it("only finish in the browser holding the cookie, and only once", () => {
    const { flow, binding } = createSsoFlow(newFlow({ kind: "web_sign_in", remember: true }))!;
    expect(binding).toBeTruthy();

    // Someone else's browser (login CSRF, or a leaked callback URL): no.
    expect(takeFlowForCallback(flow.state, "another-browser")).toEqual({ status: "wrong_browser" });
    expect(takeFlowForCallback(flow.state, null)).toEqual({ status: "wrong_browser" });
    // …and that didn't spoil it for the right browser.
    expect(takeFlowForCallback(flow.state, binding)).toMatchObject({ status: "ok", flow: { state: flow.state } });
    // Used up.
    expect(takeFlowForCallback(flow.state, binding)).toEqual({ status: "expired" });
  });

  it("expire after ten minutes", () => {
    const now = Date.now();
    const { flow, binding } = createSsoFlow(newFlow({ kind: "web_sign_in", remember: false }), now)!;
    expect(takeFlowForCallback(flow.state, binding, now + SSO_FLOW_TTL_MS + 1)).toEqual({ status: "expired" });
  });

  it("answer unknown or odd states as expired", () => {
    expect(takeFlowForCallback("nope", "x")).toEqual({ status: "expired" });
    expect(takeFlowForCallback(undefined, "x")).toEqual({ status: "expired" });
    expect(takeFlowForCallback("x".repeat(500), "x")).toEqual({ status: "expired" });
  });

  it("are replaced when the same browser starts again", () => {
    const first = createSsoFlow(newFlow({ kind: "web_sign_in", remember: false }))!;
    dropBrowserFlow(first.binding);
    expect(takeFlowForCallback(first.flow.state, first.binding)).toEqual({ status: "expired" });
  });

  it("are capped per address", () => {
    for (let i = 0; i < MAX_LIVE_SSO_FLOWS_PER_OWNER; i++) {
      expect(createSsoFlow(newFlow({ kind: "web_sign_in", remember: false }, "1.2.3.4"))).not.toBeNull();
    }
    expect(createSsoFlow(newFlow({ kind: "web_sign_in", remember: false }, "1.2.3.4"))).toBeNull();
    expect(createSsoFlow(newFlow({ kind: "web_sign_in", remember: false }, "5.6.7.8"))).not.toBeNull();
  });
});

describe("app flows", () => {
  it("need the page's Continue before a callback is accepted, then report once to the app's handle", () => {
    const { flow, binding } = createSsoFlow(newFlow({ kind: "app_sign_in", deviceName: "Anna's Mac" }))!;
    expect(binding).toBeNull();
    expect(flow.appKey).toBeTruthy();
    expect(flow.handle).toBeTruthy();
    expect(new Set([flow.state, flow.appKey, flow.handle]).size).toBe(3);

    // Not continued yet: no browser can finish it.
    expect(takeFlowForCallback(flow.state, "anything")).toEqual({ status: "expired" });
    expect(pollFlowHandle(flow.handle, { kind: "app_sign_in" })).toEqual({ status: "pending" });

    expect(getAppFlow(flow.appKey)).toBe(flow);
    const bound = bindAppFlow(flow.appKey, undefined)!;
    // Continuing again (another tab of the same browser) rebinds: only the
    // newest continue can finish.
    const rebound = bindAppFlow(flow.appKey, bound.binding)!;
    expect(takeFlowForCallback(flow.state, bound.binding)).toEqual({ status: "wrong_browser" });
    const taken = takeFlowForCallback(flow.state, rebound.binding);
    expect(taken.status).toBe("ok");
    // The page link is spent too.
    expect(getAppFlow(flow.appKey)).toBeNull();

    expect(pollFlowHandle(flow.handle, { kind: "app_sign_in" })).toEqual({ status: "pending" });
    finishFlow(flow, { ok: true, userId: "u1" });
    expect(pollFlowHandle(flow.handle, { kind: "app_sign_in" })).toMatchObject({ status: "done", result: { ok: true, userId: "u1" } });
    expect(pollFlowHandle(flow.handle, { kind: "app_sign_in" })).toEqual({ status: "expired" });
  });

  it("can't be taken over by another browser once continued", () => {
    const { flow } = createSsoFlow(newFlow({ kind: "app_sign_in", deviceName: "Anna's Mac" }))!;
    const anna = bindAppFlow(flow.appKey, null)!;
    // Someone else who has the page link: no cookie, or another flow's.
    expect(bindAppFlow(flow.appKey, undefined)).toBeNull();
    expect(bindAppFlow(flow.appKey, "someone-elses-cookie")).toBeNull();
    const other = createSsoFlow(newFlow({ kind: "web_sign_in", remember: false }))!;
    expect(bindAppFlow(flow.appKey, other.binding)).toBeNull();
    // Anna's browser still finishes it.
    expect(takeFlowForCallback(flow.state, anna.binding).status).toBe("ok");
  });

  it("keep link handles to the account that started them", () => {
    const { flow } = createSsoFlow(newFlow({ kind: "app_link", userId: "u1", username: "anna" }))!;
    expect(pollFlowHandle(flow.handle, { kind: "app_link", userId: "u2" })).toEqual({ status: "expired" });
    expect(pollFlowHandle(flow.handle, { kind: "app_sign_in" })).toEqual({ status: "expired" });
    expect(pollFlowHandle(flow.handle, { kind: "app_link", userId: "u1" })).toEqual({ status: "pending" });
    // A sign-in handle can't be used for a link either.
    const signIn = createSsoFlow(newFlow({ kind: "app_sign_in", deviceName: null }))!.flow;
    expect(pollFlowHandle(signIn.handle, { kind: "app_link", userId: "u1" })).toEqual({ status: "expired" });
  });

  it("can't be found by the state or page key in place of the handle", () => {
    const { flow } = createSsoFlow(newFlow({ kind: "app_sign_in", deviceName: null }))!;
    expect(pollFlowHandle(flow.state, { kind: "app_sign_in" })).toEqual({ status: "expired" });
    expect(pollFlowHandle(flow.appKey, { kind: "app_sign_in" })).toEqual({ status: "expired" });
    expect(getAppFlow(flow.handle)).toBeNull();
  });

  it("expire", () => {
    const now = Date.now();
    const { flow } = createSsoFlow(newFlow({ kind: "app_sign_in", deviceName: null }), now)!;
    expect(getAppFlow(flow.appKey, now + SSO_FLOW_TTL_MS + 1)).toBeNull();
    expect(pollFlowHandle(flow.handle, { kind: "app_sign_in" }, now + SSO_FLOW_TTL_MS + 1)).toEqual({ status: "expired" });
  });
});
