import { hash } from "argon2";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { fail, type CoreResult } from "@/lib/core-result";

/** True once at least one account exists — used to gate the one-time first-run
 * setup page vs. normal login, since this app has no public self-serve signup. */
export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return Boolean(row);
}

export const setupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, _ . -"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(80).optional(),
});

/** The client IP the setup rate limit is keyed on — first X-Forwarded-For
 * hop, else "unknown" (deliberately not the login limiter's getClientIp,
 * which also consults X-Real-IP, so web and API setup share one bucket). */
export function setupClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export type SetupInput = { username: unknown; password: unknown; displayName: unknown };

/**
 * Creates the very first account, as admin — shared by the web /setup action
 * and POST /api/v1/auth/setup. There's no public signup: this refuses as soon
 * as any account exists, re-checked on every attempt so a second submit
 * can't race the first into creating two accounts.
 */
export async function createFirstAdmin(
  input: SetupInput,
  ip: string,
): Promise<CoreResult<{ user: typeof users.$inferSelect }>> {
  if (await hasAnyUser()) {
    return fail("setup_complete", "Setup has already been completed. Please sign in instead.");
  }

  if (!checkRateLimit(`setup:${ip}`, 5, 60 * 60 * 1000)) {
    return fail("rate_limited", "Too many attempts. Try again later.");
  }

  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { username, password, displayName } = parsed.data;
  const passwordHash = await hash(password);
  // Only ever runs for the very first account (guarded above), so it's always
  // the one that becomes admin — matches the one-off data migration that
  // promotes the earliest existing user on already-running installs.
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, displayName, role: "admin" })
    .returning();

  return { ok: true, user };
}
