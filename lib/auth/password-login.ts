import { verify } from "argon2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { isRateLimited, recordFailedAttempt } from "@/lib/rate-limit";

export type PasswordLoginResult =
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; reason: "rate_limited" | "invalid_credentials" };

export const LOGIN_USERNAME_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * The single username/password check behind both the web sign-in (Auth.js
 * credentials provider in auth.ts) and POST /api/v1/auth/login — same
 * per-username and per-IP buckets, so failures on one count against the
 * other and neither can be used to brute-force around the other's limit.
 * Only failed attempts consume budget.
 */
export async function authenticateWithPassword(
  username: string,
  password: string,
  ip: string,
): Promise<PasswordLoginResult> {
  const usernameKey = `login:username:${username.toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;

  if (isRateLimited(usernameKey, LOGIN_USERNAME_LIMIT) || isRateLimited(ipKey, LOGIN_IP_LIMIT)) {
    return { ok: false, reason: "rate_limited" };
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || !user.passwordHash) {
    recordFailedAttempt(usernameKey, LOGIN_WINDOW_MS);
    recordFailedAttempt(ipKey, LOGIN_WINDOW_MS);
    return { ok: false, reason: "invalid_credentials" };
  }

  const valid = await verify(user.passwordHash, password);
  if (!valid) {
    recordFailedAttempt(usernameKey, LOGIN_WINDOW_MS);
    recordFailedAttempt(ipKey, LOGIN_WINDOW_MS);
    return { ok: false, reason: "invalid_credentials" };
  }

  return { ok: true, user };
}
