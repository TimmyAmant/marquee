import { describe, expect, it } from "vitest";
import { API_OPERATIONS } from "@/lib/api/openapi/registry";
import { buildOpenApiSpec } from "@/lib/api/openapi/spec";
import { routeFileOperations } from "@/lib/api/openapi/route-files";

// The OpenAPI description can't drift from the routes: every exported
// handler under app/api/v1 is in the registry, and every registry entry is
// a real handler.

const key = (op: { method: string; path: string }) => `${op.method} ${op.path}`;

describe("the API route registry", () => {
  const files = routeFileOperations();

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("lists every route file's handlers", () => {
    const registered = new Set(API_OPERATIONS.map(key));
    const missing = files.map(key).filter((k) => !registered.has(k));
    expect(missing, "add these to lib/api/openapi/registry.ts").toEqual([]);
  });

  it("lists nothing that isn't a route file's handler", () => {
    const real = new Set(files.map(key));
    const extra = API_OPERATIONS.map(key).filter((k) => !real.has(k));
    expect(extra, "no such handler under app/api/v1").toEqual([]);
  });

  it("lists each operation once", () => {
    const all = API_OPERATIONS.map(key);
    expect(all.filter((k, i) => all.indexOf(k) !== i)).toEqual([]);
  });

  it("keeps public operations to discovery and sign-in", () => {
    const publicPaths = API_OPERATIONS.filter((op) => op.auth === "public").map((op) => op.path);
    for (const path of publicPaths) {
      expect(path === "/server-info" || path === "/openapi.json" || path.startsWith("/auth/"), path).toBe(true);
    }
  });
});

describe("the OpenAPI description", () => {
  const spec = buildOpenApiSpec("1.2.3") as {
    openapi: string;
    info: { version: string };
    paths: Record<string, Record<string, { operationId: string; parameters?: { name: string }[]; security: unknown[]; "x-api-key-access": string }>>;
    components: { schemas: Record<string, unknown> };
  };

  it("is OpenAPI 3.1 with the server's version", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.version).toBe("1.2.3");
  });

  it("has one operation per registry entry, with unique operation ids", () => {
    const ops = Object.values(spec.paths).flatMap((methods) => Object.values(methods));
    expect(ops).toHaveLength(API_OPERATIONS.length);
    const ids = ops.map((op) => op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares every path parameter", () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      for (const op of Object.values(methods)) {
        expect((op.parameters ?? []).map((p) => p.name)).toEqual(names);
      }
    }
  });

  it("resolves every $ref", () => {
    const json = JSON.stringify(spec);
    const refs = [...json.matchAll(/"\$ref":"#\/components\/(schemas|responses)\/([^"]+)"/g)];
    expect(refs.length).toBeGreaterThan(0);
    const components = (spec as unknown as { components: Record<string, Record<string, unknown>> }).components;
    for (const [, kind, name] of refs) expect(components[kind][name], `${kind}/${name}`).toBeDefined();
  });

  it("reports what API keys may call, from the enforced policy", () => {
    expect(spec.paths["/stats/summary"].get["x-api-key-access"]).toBe("read");
    expect(spec.paths["/titles/{type}/{id}/request"].post["x-api-key-access"]).toBe("full");
    expect(spec.paths["/settings/api-keys"].post["x-api-key-access"]).toBe("none");
    expect(spec.paths["/settings/api-keys"].get.security).toEqual([{ deviceToken: [] }]);
    expect(spec.paths["/server-info"].get.security).toEqual([]);
  });
});
