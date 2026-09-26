// Test helper: every operation the route files under app/api/v1 export,
// read straight from the source (so it can't disagree with the build).
import fs from "node:fs";
import path from "node:path";
import type { HttpMethod } from "@/lib/api/openapi/registry";

export const API_V1_DIR = path.resolve(__dirname, "../../../app/api/v1");

export type RouteFileOperation = { method: HttpMethod; path: string; file: string };

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** "/titles/{type}/{id}" for app/api/v1/titles/[type]/[id]/route.ts. The
 * catch-all 404 route ([[...slug]]) isn't an operation. */
export function routeFileOperations(): RouteFileOperation[] {
  return routeFiles(API_V1_DIR)
    .filter((file) => !file.includes("[[..."))
    .flatMap((file) => {
      const relative = path.relative(API_V1_DIR, path.dirname(file)).split(path.sep);
      const apiPath = `/${relative.map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}")).join("/")}`;
      const source = fs.readFileSync(file, "utf8");
      const methods = [...source.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
        (match) => match[1] as HttpMethod,
      );
      return methods.map((method) => ({ method, path: apiPath, file }));
    });
}
