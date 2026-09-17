import { jsonError } from "@/lib/api/errors";

// Any /api/v1 path without its own route answers with a contract-shaped JSON
// 404 (instead of the website's HTML not-found page).
function notFound(request: Request): Response {
  const { pathname } = new URL(request.url);
  return jsonError(404, "not_found", `No API endpoint at ${request.method} ${pathname}.`);
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
