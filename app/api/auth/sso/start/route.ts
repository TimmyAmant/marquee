import { NextResponse, type NextRequest } from "next/server";
import { getSsoConfig } from "@/lib/auth/sso/config";
import { dropBrowserFlow, SSO_COOKIE } from "@/lib/auth/sso/flows";
import { startWebSsoSignIn } from "@/lib/auth/sso/signin";
import { isPublicHost, ssoCookieOptions } from "@/lib/auth/sso/web";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function toLogin(code: string): NextResponse {
  // Relative, so it stays on whatever address the browser is using.
  return new NextResponse(null, { status: 303, headers: { Location: `/login?sso=${code}` } });
}

/**
 * The login page's "Sign in with <SSO>": starts a flow, binds it to this
 * browser with a cookie, and sends the browser to the identity provider.
 * `?remember=1` carries "Keep me signed in". Opened on another address than
 * the one the provider sends people back to, it first moves over there (once)
 * so the cookie is where the callback will look for it.
 */
export async function GET(request: NextRequest) {
  const config = await getSsoConfig();
  if (!config) return toLogin("not_configured");
  const remember = request.nextUrl.searchParams.get("remember") === "1";

  if (!isPublicHost(config.publicUrl, request.headers)) {
    if (request.nextUrl.searchParams.get("hop") === "1") return toLogin("failed");
    const there = new URL("/api/auth/sso/start", config.publicUrl);
    if (remember) there.searchParams.set("remember", "1");
    there.searchParams.set("hop", "1");
    return NextResponse.redirect(there, 303);
  }

  dropBrowserFlow(request.cookies.get(SSO_COOKIE)?.value);
  const started = await startWebSsoSignIn(getClientIp(request), remember);
  if (!started.ok) return toLogin(started.code === "rate_limited" ? "rate_limited" : "failed");

  const response = NextResponse.redirect(started.flow.authUrl, 303);
  response.cookies.set(SSO_COOKIE, started.binding!, ssoCookieOptions(config.publicUrl));
  return response;
}
