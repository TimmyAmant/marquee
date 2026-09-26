import { NextResponse, type NextRequest } from "next/server";
import { getSsoConfig } from "@/lib/auth/sso/config";
import { SSO_COOKIE } from "@/lib/auth/sso/flows";
import { continueAppFlow } from "@/lib/auth/sso/signin";
import { isSameOriginPost, ssoCookieOptions } from "@/lib/auth/sso/web";

export const dynamic = "force-dynamic";

function done(result: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: `/login/sso/done?result=${result}` } });
}

/**
 * "Continue" on the page an app opened (/login/sso/app): binds this browser
 * to the app's flow and goes on to the identity provider. Only a form on
 * Marquee's own page can do this — a cross-site POST is refused — so nobody
 * can push a visitor through an app sign-in they didn't start.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request.headers)) return done("expired");
  const config = await getSsoConfig();
  if (!config) return done("not_configured");

  let key: FormDataEntryValue | null = null;
  try {
    key = (await request.formData()).get("key");
  } catch {
    return done("expired");
  }
  const continued = continueAppFlow(key, request.cookies.get(SSO_COOKIE)?.value);
  if (!continued) return done("expired");

  const response = NextResponse.redirect(continued.authUrl, 303);
  response.cookies.set(SSO_COOKIE, continued.binding, ssoCookieOptions(config.publicUrl));
  return response;
}
