import { describe, expect, it } from "vitest";
import { apiKeyDecision, KEY_DENIED_MESSAGE, KEY_READ_ONLY_MESSAGE, normalizeApiPath } from "@/lib/api/key-policy";
import { routeFileOperations } from "@/lib/api/openapi/route-files";

const url = (path: string) => `/api/v1${path}`;
/** A concrete URL path for a route: every {param} filled in. */
const concrete = (path: string) => path.replace(/\{[^}]+\}/g, "1");

describe("apiKeyDecision over every route file", () => {
  const operations = routeFileOperations();

  it("refuses every mutating method to a read-only key", () => {
    const mutating = operations.filter((op) => op.method !== "GET" && !(op.method === "POST" && op.path === "/surprise"));
    expect(mutating.length).toBeGreaterThan(80);
    for (const op of mutating) {
      const decision = apiKeyDecision(op.method, url(concrete(op.path)), "read");
      expect(decision.allowed, `${op.method} ${op.path}`).toBe(false);
    }
  });

  it("lets a read-only key read the everyday endpoints", () => {
    for (const path of ["/stats/summary", "/badges", "/requests/pending", "/issues", "/titles/movie/603", "/calendar", "/users"]) {
      expect(apiKeyDecision("GET", url(path), "read")).toEqual({ allowed: true });
    }
    expect(apiKeyDecision("HEAD", url("/badges"), "read")).toEqual({ allowed: true });
    expect(apiKeyDecision("POST", url("/surprise"), "read")).toEqual({ allowed: true });
  });

  it("lets a full key make requests and review them", () => {
    for (const [method, path] of [
      ["POST", "/titles/movie/603/request"],
      ["POST", "/requests/1/approve"],
      ["DELETE", "/requests/1"],
      ["POST", "/issues/1/comments"],
      ["POST", "/notifications/read-all"],
    ]) {
      expect(apiKeyDecision(method, url(path), "full"), `${method} ${path}`).toEqual({ allowed: true });
    }
  });

  it("never lets any key manage keys, sign in, or touch integrations and admin settings", () => {
    const denied = operations.filter(
      (op) =>
        op.path.startsWith("/settings/api-keys") ||
        op.path.startsWith("/auth/") ||
        op.path.startsWith("/me/links/") ||
        op.path.startsWith("/settings/integrations") ||
        op.path.startsWith("/settings/arr-servers") ||
        op.path.startsWith("/settings/sso") ||
        op.path.startsWith("/settings/sign-in") ||
        op.path.startsWith("/users/import") ||
        op.path.startsWith("/settings/import") ||
        (op.path.startsWith("/settings/") && op.method !== "GET") ||
        (op.path.startsWith("/users") && op.method !== "GET") ||
        (op.path.startsWith("/me/notification-channels") && op.method !== "GET"),
    );
    expect(denied.length).toBeGreaterThan(60);
    for (const op of denied) {
      for (const scope of ["read", "full"] as const) {
        expect(apiKeyDecision(op.method, url(concrete(op.path)), scope), `${scope} ${op.method} ${op.path}`).toEqual({
          allowed: false,
          message: KEY_DENIED_MESSAGE,
        });
      }
    }
  });

  it("lets keys read the harmless admin settings only", () => {
    expect(apiKeyDecision("GET", url("/settings/activity"), "read").allowed).toBe(true);
    expect(apiKeyDecision("GET", url("/settings/jobs"), "read").allowed).toBe(true);
    expect(apiKeyDecision("GET", url("/settings/integrations"), "full").allowed).toBe(false);
    expect(apiKeyDecision("GET", url("/settings/api-keys"), "full").allowed).toBe(false);
    expect(apiKeyDecision("POST", url("/settings/jobs/sync/run"), "full").allowed).toBe(false);
  });
});

describe("apiKeyDecision can't be sidestepped by spelling", () => {
  it.each([
    "/api/v1/settings/API-KEYS",
    "/api/v1/settings//api-keys",
    "/api/v1/settings/api-keys/",
    "/api/v1/settings/%61pi-keys",
    "/api/v1//settings/integrations/sonarr",
    "/api/v1/settings/%69ntegrations",
    "/api/v1/titles/../settings/api-keys",
    "/api/v1/settings/%E0%A4%A",
    "/api/v2/anything",
  ])("refuses %s", (path) => {
    expect(apiKeyDecision("GET", path, "full").allowed).toBe(false);
  });

  it("reports read-only refusals with their own message", () => {
    expect(apiKeyDecision("post", url("/titles/movie/1/request"), "read")).toEqual({
      allowed: false,
      message: KEY_READ_ONLY_MESSAGE,
    });
  });

  it("normalizes paths", () => {
    expect(normalizeApiPath("/api/v1")).toBe("/");
    expect(normalizeApiPath("/api/v1/Badges/")).toBe("/badges");
    expect(normalizeApiPath("/api/v10/badges")).toBeNull();
  });
});
