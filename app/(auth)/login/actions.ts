"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { issueLoginTicket } from "@/lib/auth/login-tickets";
import { pollPlexSignIn, signInWithJellyfin, startPlexSignIn } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";

const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 1 day when "keep me signed in" is unchecked

/** Gives the fresh session cookie the lifetime "Keep me signed in" asked for. */
async function applySessionMaxAge(remember: boolean) {
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

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const remember = formData.get("remember") === "on";

  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      remember: formData.get("remember"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if ((error as { code?: string }).code === "rate_limited") {
        return { error: "Too many attempts. Try again in a few minutes." };
      }
      return { error: "Incorrect username or password" };
    }
    throw error;
  }

  await applySessionMaxAge(remember);
  redirect("/");
}

/** Signs the browser in as an account Plex/Jellyfin sign-in settled on: a
 * login ticket issued and redeemed right here, so it never reaches the
 * browser. */
async function signInWithTicket(userId: string, remember: boolean) {
  await signIn("media-server", {
    ticket: issueLoginTicket(userId),
    remember: remember ? "on" : "",
    redirect: false,
  });
  await applySessionMaxAge(remember);
}

export type PlexSignInStart = { handle?: string; authUrl?: string; error?: string };

export async function startPlexSignInAction(): Promise<PlexSignInStart> {
  const result = await startPlexSignIn(getClientIp(await headers()));
  return result.ok ? { handle: result.handle, authUrl: result.authUrl } : { error: result.error };
}

export type PlexSignInPoll = { status: "pending" } | { status: "error"; error: string };

/** One poll of the Plex sign-in the page started; on success signs in and
 * goes home, like the password form. */
export async function pollPlexSignInAction(handle: string, remember: boolean): Promise<PlexSignInPoll> {
  const poll = await pollPlexSignIn(handle, getClientIp(await headers()));
  if (poll.status === "pending") return { status: "pending" };
  if (poll.status === "expired") return { status: "error", error: "That Plex sign-in expired. Try again." };
  if (!poll.ok) return { status: "error", error: poll.error };

  await signInWithTicket(poll.user.id, remember);
  redirect("/");
}

export async function jellyfinLoginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const username = formData.get("username");
  const password = formData.get("password");
  if (typeof username !== "string" || !username || typeof password !== "string" || !password) {
    return { error: "Enter your Jellyfin username and password." };
  }

  const result = await signInWithJellyfin(username, password, getClientIp(await headers()));
  if (!result.ok) return { error: result.error };

  await signInWithTicket(result.user.id, formData.get("remember") === "on");
  redirect("/");
}
