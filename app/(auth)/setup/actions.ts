"use server";

import { headers } from "next/headers";
import { hash } from "argon2";
import { z } from "zod";
import { AuthError } from "next-auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { signIn } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasAnyUser } from "@/lib/auth/setup";

const setupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, _ . -"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(80).optional(),
});

export type SetupState = { error?: string };

export async function setupAction(
  _prevState: SetupState | undefined,
  formData: FormData,
): Promise<SetupState> {
  // There's no public signup — this action only ever creates the very first
  // account. Re-check on every submit (not just page load) so a second setup
  // attempt can't race the first and create two accounts.
  if (await hasAnyUser()) {
    return { error: "Setup has already been completed. Please sign in instead." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(`setup:${ip}`, 5, 60 * 60 * 1000)) {
    return { error: "Too many attempts. Try again later." };
  }

  const parsed = setupSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { username, password, displayName } = parsed.data;
  const passwordHash = await hash(password);
  // This action only ever runs for the very first account (guarded above),
  // so it's always the one that becomes admin — matches the one-off data
  // migration that promotes the earliest existing user on already-running
  // installs.
  await db.insert(users).values({ username, passwordHash, displayName, role: "admin" });

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
