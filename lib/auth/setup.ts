import { hash } from "argon2";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { fail, type CoreResult } from "@/lib/core-result";
import { getT } from "@/lib/i18n/server";
import { displayNameSchema, firstIssueMessage, passwordSchema, usernameSchema } from "@/lib/users/account-rules";

/** True once at least one account exists — used to gate the one-time first-run
 * setup page vs. normal login, since this app has no public self-serve signup. */
export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return Boolean(row);
}

export const setupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
});

/** The client address the setup rate limit is keyed on — getClientIp, so
 * web and API setup share one bucket, and one shared "unknown" bucket when
 * no trusted proxy says who the client is. */
export function setupClientIp(headers: Headers): string {
  return getClientIp(headers) ?? "unknown";
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
  const t = await getT();
  if (await hasAnyUser()) {
    return fail("setup_complete", t("server.setupDone"));
  }

  if (!checkRateLimit(`setup:${ip}`, 5, 60 * 60 * 1000)) {
    return fail("rate_limited", t("server.tooManyAttemptsLater"));
  }

  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", firstIssueMessage(parsed.error, t));
  }

  const { username, password, displayName } = parsed.data;
  const passwordHash = await hash(password);
  // Only ever runs for the very first account, so it's always the one that
  // becomes admin — matches the one-off data migration that promotes the
  // earliest existing user on already-running installs. The check above is
  // only a fast path: two first-run submits landing together would both
  // pass it, so the real check happens again under a transaction-scoped
  // lock, where the second one waits for the first and then sees its user.
  const user = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('marquee-first-admin-setup'))`);
    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing) return null;
    const [created] = await tx
      .insert(users)
      .values({ username, passwordHash, displayName, role: "admin" })
      .returning();
    return created;
  });
  if (!user) {
    return fail("setup_complete", t("server.setupDone"));
  }

  return { ok: true, user };
}
