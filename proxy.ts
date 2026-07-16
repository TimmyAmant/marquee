import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  // The homepage stays public so visitors can see what Marquee is before
  // creating an account — everything else requires signing in.
  if (req.nextUrl.pathname === "/") return NextResponse.next();

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: [
    // Auth/page-flow routes, Next.js internals, the code-generated
    // icon/apple-icon routes, anything under public/ (matched generically by
    // file extension so a new static asset doesn't silently get auth-gated
    // too), and the webhook ingestion endpoint — that one is called by
    // Radarr/Sonarr directly (no session cookie) and authenticates itself
    // via a per-user secret in the URL instead.
    "/((?!api/auth|api/webhooks|login|setup|_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|xml|json|woff|woff2)$).*)",
  ],
};
