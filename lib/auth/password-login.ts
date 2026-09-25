import { hash, verify } from "argon2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  attemptCount,
  isRateLimited,
  recordFailedAttempt,
  refundAttempt,
  reserveSlot,
} from "@/lib/rate-limit";

export type PasswordLoginResult =
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; reason: "rate_limited" | "invalid_credentials" };

/** Failures one client address gets against one username before it's refused. */
export const LOGIN_CLIENT_LIMIT = 5;
/** Failures one client address gets across every username before it's refused. */
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Failures on a username (from anywhere) before its attempts are spaced out. */
export const LOGIN_BACKOFF_AFTER = 5;
export const LOGIN_BACKOFF_BASE_MS = 1000;
export const LOGIN_BACKOFF_MAX_MS = 10 * 1000;

/** How far apart attempts on a username are spaced once it has `failures`
 * recent failures: nothing below the threshold, then doubling to the cap. */
export function loginBackoffMs(failures: number): number {
  if (failures < LOGIN_BACKOFF_AFTER) return 0;
  return Math.min(LOGIN_BACKOFF_BASE_MS * 2 ** (failures - LOGIN_BACKOFF_AFTER), LOGIN_BACKOFF_MAX_MS);
}

// Unknown usernames are checked against this, so they cost the same argon2
// time as a wrong password and response timing doesn't reveal which
// usernames exist. Hashed once, on first need, with the same defaults real
// passwords get.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  return (dummyHash ??= hash("marquee-no-such-user"));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The single username/password check behind both the web sign-in (Auth.js
 * credentials provider in auth.ts) and POST /api/v1/auth/login — same
 * buckets, so failures on one count against the other and neither can be
 * used to brute-force around the other's limit. Only failed attempts consume
 * budget. `ip` is getClientIp's answer, null when it can't be known.
 *
 * Two layers, so that guessing is slow without letting anyone lock the real
 * owner out:
 *  - Per client address (when known): 5 failures on one username, or 20
 *    across all of them, and that address is refused for the window. Only
 *    whoever made the failures is affected.
 *  - Per username, from anywhere: past 5 failures, attempts on it are queued
 *    one at a time, spaced 1s, 2s, 4s… up to 10s apart. That caps the guess
 *    rate however many addresses an attacker uses, but never refuses — the
 *    right password still gets in, after at most a short wait.
 * Without a trusted address (no TRUSTED_PROXY_HOPS) there is no first layer:
 * everyone would share one address bucket, and filling it would lock
 * everyone out.
 */
export async function authenticateWithPassword(
  username: string,
  password: string,
  ip: string | null,
): Promise<PasswordLoginResult> {
  const name = username.toLowerCase();
  const usernameKey = `login:username:${name}`;
  const clientLimits: [key: string, limit: number][] = ip
    ? [
        [`login:client:${name}:${ip}`, LOGIN_CLIENT_LIMIT],
        [`login:ip:${ip}`, LOGIN_IP_LIMIT],
      ]
    : [];

  if (clientLimits.some(([key, limit]) => isRateLimited(key, limit))) {
    return { ok: false, reason: "rate_limited" };
  }

  // The attempt is counted before the slow part, not after it: an argon2
  // check takes long enough that a burst of parallel requests would all
  // pass the read-only check above and each get a free guess. The slot is
  // booked in the same synchronous step for the same reason. A correct
  // password gets its attempt refunded below, so normal use costs nothing.
  const wait = reserveSlot(usernameKey, loginBackoffMs(attemptCount(usernameKey)));
  recordFailedAttempt(usernameKey, LOGIN_WINDOW_MS);
  for (const [key] of clientLimits) recordFailedAttempt(key, LOGIN_WINDOW_MS);
  if (wait > 0) await sleep(wait);

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || !user.passwordHash) {
    await verify(await getDummyHash(), password).catch(() => false);
    return { ok: false, reason: "invalid_credentials" };
  }

  const valid = await verify(user.passwordHash, password);
  if (!valid) {
    return { ok: false, reason: "invalid_credentials" };
  }

  refundAttempt(usernameKey);
  for (const [key] of clientLimits) refundAttempt(key);
  return { ok: true, user };
}
