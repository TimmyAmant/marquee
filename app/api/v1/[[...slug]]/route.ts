import { jsonError } from "@/lib/api/errors";
import { translatorFor } from "@/lib/i18n/catalog";
import { resolveLocale } from "@/lib/i18n/locales";

// Any /api/v1 path without its own route answers with a contract-shaped JSON
// 404 (instead of the website's HTML not-found page).
function notFound(request: Request): Response {
  const { pathname } = new URL(request.url);
  // No account here: the request's Accept-Language, else English.
  const t = translatorFor(resolveLocale(null, request.headers.get("accept-language")));
  return jsonError(404, "not_found", t("server.noEndpoint", { method: request.method, path: pathname }));
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
