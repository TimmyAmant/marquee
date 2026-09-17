"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { createFirstAdmin, setupClientIp } from "@/lib/auth/setup";

export type SetupState = { error?: string };

export async function setupAction(
  _prevState: SetupState | undefined,
  formData: FormData,
): Promise<SetupState> {
  // There's no public signup — this action only ever creates the very first
  // account (see createFirstAdmin, shared with POST /api/v1/auth/setup).
  const headerList = await headers();
  const input = {
    username: formData.get("username"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  };

  const result = await createFirstAdmin(input, setupClientIp(headerList));
  if (!result.ok) return { error: result.error };

  const { username } = result.user;
  const password = input.password as string;

  try {
    await signIn("credentials", { username, password, remember: "on", redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Please log in." };
    }
    throw error;
  }

  return {};
}
