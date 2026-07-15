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
  email: z.string().email("Enter a valid email"),
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
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password, displayName } = parsed.data;
  const passwordHash = await hash(password);
  await db.insert(users).values({ email, passwordHash, displayName });

  try {
    await signIn("credentials", { email, password, remember: "on", redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Please log in." };
    }
    throw error;
  }

  return {};
}
