import "server-only";
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { issueLoginTicket } from "@/lib/auth/login-tickets";

// Giving a browser its session once the server has settled who someone is —
// shared by the login page's server actions and the SSO callback route. Not
// a "use server" module on purpose: nothing here may be callable from a
// browser directly.

const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 1 day when "keep me signed in" is unchecked

/** Gives the fresh session cookie the lifetime "Keep me signed in" asked for. */
export async function applySessionMaxAge(remember: boolean) {
  const maxAge = remember ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE;
  const cookieStore = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    const existing = cookieStore.get(name);
    if (existing) {
      cookieStore.set(name, existing.value, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: name.startsWith("__Secure-"),
        maxAge,
      });
    }
  }
}

/** Signs the browser in as an account Plex/Jellyfin/SSO sign-in settled on:
 * a login ticket issued and redeemed right here, so it never reaches the
 * browser. */
export async function signInWithTicket(userId: string, remember: boolean) {
  await signIn("media-server", {
    ticket: issueLoginTicket(userId),
    remember: remember ? "on" : "",
    redirect: false,
  });
  await applySessionMaxAge(remember);
}
