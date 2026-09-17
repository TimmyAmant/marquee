import { describe, it, expect, vi } from "vitest";
import {
  ApiError,
  API_VERSION_HEADER,
  errorToApiError,
  jsonError,
  apiJson,
  statusForCode,
  TMDB_NOT_CONFIGURED_API_MESSAGE,
} from "./errors";
import { withApi } from "./handler";
import { fail } from "@/lib/core-result";
import { TmdbError, TmdbNotConfiguredError } from "@/lib/tmdb/errors";

describe("statusForCode", () => {
  it("maps contract codes to HTTP statuses", () => {
    expect(statusForCode("invalid")).toBe(400);
    expect(statusForCode("unauthorized")).toBe(401);
    expect(statusForCode("invalid_credentials")).toBe(401);
    expect(statusForCode("forbidden")).toBe(403);
    expect(statusForCode("not_found")).toBe(404);
    expect(statusForCode("conflict")).toBe(409);
    expect(statusForCode("setup_complete")).toBe(409);
    expect(statusForCode("rate_limited")).toBe(429);
    expect(statusForCode("internal")).toBe(500);
    expect(statusForCode("upstream")).toBe(502);
  });
});

describe("ApiError.fromFailure", () => {
  it("keeps the shared core's message and code", () => {
    const err = ApiError.fromFailure(fail("conflict", "You've already requested this."));
    expect(err.status).toBe(409);
    expect(err.code).toBe("conflict");
    expect(err.message).toBe("You've already requested this.");
  });
});

describe("errorToApiError", () => {
  it("passes ApiError through", () => {
    const original = ApiError.of("forbidden", "Only the admin can do this.");
    expect(errorToApiError(original)).toEqual({ error: original, unexpected: false });
  });

  it("reports missing TMDb configuration as upstream", () => {
    const { error, unexpected } = errorToApiError(new TmdbNotConfiguredError());
    expect(error.status).toBe(502);
    expect(error.code).toBe("upstream");
    expect(error.message).toBe(TMDB_NOT_CONFIGURED_API_MESSAGE);
    expect(unexpected).toBe(false);
  });

  it("maps TMDb 404s to not_found and other TMDb failures to upstream", () => {
    expect(errorToApiError(new TmdbError("x", 404)).error.code).toBe("not_found");
    const { error } = errorToApiError(new TmdbError("TMDb request failed: /movie/1 (503)", 503));
    expect(error.code).toBe("upstream");
    expect(error.message).toContain("TMDb");
  });

  it("maps timeouts and network failures to upstream", () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    expect(errorToApiError(timeout).error.code).toBe("upstream");
    expect(errorToApiError(new TypeError("fetch failed")).error.code).toBe("upstream");
  });

  it("hides everything else behind a generic 500", () => {
    const { error, unexpected } = errorToApiError(new Error('relation "users" does not exist'));
    expect(error.status).toBe(500);
    expect(error.code).toBe("internal");
    expect(error.message).not.toContain("relation");
    expect(unexpected).toBe(true);
  });
});

describe("responses", () => {
  it("jsonError uses the contract body and version header", async () => {
    const res = jsonError(404, "not_found", "Nope");
    expect(res.status).toBe(404);
    expect(res.headers.get(API_VERSION_HEADER)).toBe("1");
    expect(await res.json()).toEqual({ error: "Nope", code: "not_found" });
  });

  it("apiJson adds the version header", () => {
    expect(apiJson({ ok: true }).headers.get(API_VERSION_HEADER)).toBe("1");
  });
});

describe("withApi", () => {
  const ctx = { params: Promise.resolve({ id: "7" }) };

  it("serializes returned values as 200 JSON with the version header", async () => {
    const handler = withApi<{ id: string }>(async (_req, params) => ({ id: params.id }));
    const res = await handler(new Request("http://localhost/api/v1/x"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get(API_VERSION_HEADER)).toBe("1");
    expect(await res.json()).toEqual({ id: "7" });
  });

  it("converts thrown ApiErrors", async () => {
    const handler = withApi(async () => {
      throw ApiError.of("unauthorized", "Sign in again");
    });
    const res = await handler(new Request("http://localhost/api/v1/x"), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in again", code: "unauthorized" });
  });

  it("logs and hides unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = withApi(async () => {
      throw new Error("secret connection string postgres://user:pw@host/db");
    });
    const res = await handler(new Request("http://localhost/api/v1/x", { method: "POST" }), ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
