"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 1 day when "keep me signed in" is unchecked

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const remember = formData.get("remember") === "on";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      remember: formData.get("remember"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if ((error as { code?: string }).code === "rate_limited") {
        return { error: "Too many attempts. Try again in a few minutes." };
      }
      return { error: "Incorrect email or password" };
    }
    throw error;
  }

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

  redirect("/");
}
