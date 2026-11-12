import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { contentSecurityPolicy, createNonce } from "@/lib/security/csp";

// Paths anyone may open without signing in: auth/page-flow routes, the
// code-generated icon/apple-icon routes, top-level files under public/
// (matched generically by file extension so a new static asset doesn't
// silently get auth-gated too), and the webhook ingestion endpoint — that
// one is called by Radarr/Sonarr directly (no session cookie) and
// authenticates itself via a per-user secret in the URL instead. /api/v1 is
// the native-app JSON API: its routes authenticate bearer tokens themselves
// and must answer 401 JSON, never a redirect to the HTML login page.
// /api-docs is the public, read-only table of those endpoints (the same as
// the public /api/v1/openapi.json).
//
// Each exclusion is anchored (a following "/" or the end of the path): a
// bare prefix like "login" would also let "/login-history" through, and the
// file-extension rule is limited to a single path segment so
// "/title/tv/1399.js" can't slip past the gate and reach that page's server
// actions.
const PUBLIC_PATH =
  /^\/(?:api\/auth(?:\/|$)|api\/webhooks(?:\/|$)|api\/v1(?:\/|$)|api-docs(?:\/|$)|login(?:\/|$)|setup(?:\/|$)|_next\/static(?:\/|$)|_next\/image(?:\/|$)|favicon\.ico$|icon$|apple-icon$|[^/]+\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|xml|json|webmanifest|woff|woff2)$)/;

/** Whether this path needs a signed-in session (exported for its tests). */
export function needsSignIn(pathname: string): boolean {
  // The homepage stays public so visitors can see what Marquee is before
  // creating an account — everything else requires signing in.
  return pathname !== "/" && !PUBLIC_PATH.test(pathname);
}

export default auth((req) => {
  if (needsSignIn(req.nextUrl.pathname) && !req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Every page gets the Content-Security-Policy (lib/security/csp.ts) with
  // a nonce of its own. Next.js reads it off the request to put the nonce on
  // its scripts; the root layout reads x-nonce for the theme-init script.
  // Every page is rendered per request already (the root layout reads
  // cookies), which nonces need.
  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
});

export const config = {
  matcher: [
    // Everything but what neither needs a session nor is a page: Next.js's
    // static files and image optimizer, the generated icons, files under
    // public/, and the API routes that authenticate themselves (sign-in,
    // webhooks, /api/v1). The pages among the public paths above (login,
    // setup, /api-docs, the homepage) run through here for their
    // Content-Security-Policy, and needsSignIn lets them through.
    "/((?!api/auth(?:/|$)|api/webhooks(?:/|$)|api/v1(?:/|$)|_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|icon$|apple-icon$|[^/]+\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|xml|json|webmanifest|woff|woff2)$).*)",
  ],
};
