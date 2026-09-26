import { describe, it, expect, vi } from "vitest";
import {
  ApiError,
  API_VERSION_HEADER,
  errorToApiError,
  jsonError,
  apiJson,
  msg,
  statusForCode,
} from "./errors";
import { englishT, translatorFor } from "@/lib/i18n/catalog";
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
    expect(statusForCode("expired")).toBe(410);
    expect(statusForCode("rate_limited")).toBe(429);
    expect(statusForCode("internal")).toBe(500);
    expect(statusForCode("upstream")).toBe(502);
  });
});

describe("ApiError messages", () => {
  it("are English in .message and translated by messageIn", () => {
    const err = ApiError.of("not_found", msg("server.invalidId", { label: "id", value: "x" }));
    expect(err.message).toBe('Invalid id "x".');
    expect(err.messageIn(englishT())).toBe('Invalid id "x".');
    expect(err.messageIn(translatorFor("es"))).toBe('id no válido: "x".');
  });

  it("keeps a message that's already written for the reader", () => {
    expect(ApiError.of("conflict", "Déjà fait.").messageIn(translatorFor("de"))).toBe("Déjà fait.");
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
  it("carries a shared core's reason onto the error body", async () => {
    const error = ApiError.fromFailure({ ok: false, code: "conflict", error: "Sonarr no puede resolver esta serie.", apiReason: "sonarr_unresolved" });
    expect(error.reason).toBe("sonarr_unresolved");
    const response = jsonError(error.status, error.code, error.message, error.reason);
    expect(await response.json()).toEqual({ error: "Sonarr no puede resolver esta serie.", code: "conflict", reason: "sonarr_unresolved" });
    expect(await jsonError(404, "not_found", "Nope").json()).toEqual({ error: "Nope", code: "not_found" });
  });

  it("passes ApiError through", () => {
    const original = ApiError.of("forbidden", "Only the admin can do this.");
    expect(errorToApiError(original)).toEqual({ error: original, unexpected: false });
  });

  it("reports missing TMDb configuration as upstream", () => {
    const { error, unexpected } = errorToApiError(new TmdbNotConfiguredError());
    expect(error.status).toBe(502);
    expect(error.code).toBe("upstream");
    expect(error.message).toBe(
      "TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations.",
    );
    expect(error.messageIn(translatorFor("de"))).toContain("TMDb ist auf diesem Server nicht eingerichtet");
    // What an app checks for, since the message follows the reader's language.
    expect(error.reason).toBe("tmdb_not_configured");
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

  it("answers in the request's Accept-Language, English without one", async () => {
    const handler = withApi(async () => {
      throw ApiError.of("not_found", msg("server.notificationNotFound"));
    });
    const french = await handler(
      new Request("http://localhost/api/v1/x", { headers: { "accept-language": "fr-CA,fr;q=0.9,en;q=0.5" } }),
      ctx,
    );
    expect(french.status).toBe(404);
    expect(await french.json()).toEqual({ error: "Notification introuvable.", code: "not_found" });
    const english = await handler(new Request("http://localhost/api/v1/x"), ctx);
    expect(await english.json()).toEqual({ error: "Notification not found.", code: "not_found" });
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
