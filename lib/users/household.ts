import { hash, verify } from "argon2";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { revokeAllApiTokensForUser } from "@/lib/api/token-store";
import { removeAllSubscriptions } from "@/lib/push/deliver";
import { isRateLimited, recordFailedAttempt, refundAttempt } from "@/lib/rate-limit";

// Household-account management shared by the Settings → Account server
// actions (app/settings/users-actions.ts) and /api/v1/users. Callers resolve
// who is acting (session or bearer token); everything from validation onward
// lives here so both surfaces enforce identical rules and messages.

export type HouseholdMember = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  autoApproveMovies: boolean;
  autoApproveTv: boolean;
  /** When the profile photo last changed; null when there's none (lib/users/avatar.ts). */
  avatarUpdatedAt: Date | null;
  createdAt: Date;
  /** Signs in with Plex / Jellyfin (lib/auth/media-signin.ts). Only
   * whether — the linked ids themselves stay on the server. */
  plexLinked: boolean;
  jellyfinLinked: boolean;
  /** False for an account made by Plex/Jellyfin sign-in or import that
   * hasn't set a password yet. */
  hasPassword: boolean;
  /** Last time the account used the website or an app, to within a few
   * minutes (lib/users/last-active.ts); null when it never has. */
  lastActiveAt: Date | null;
};

export type Actor = { userId: string; isAdmin: boolean };

const memberColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  autoApproveMovies: users.autoApproveMovies,
  autoApproveTv: users.autoApproveTv,
  avatarUpdatedAt: users.avatarUpdatedAt,
  createdAt: users.createdAt,
  plexLinked: sql<boolean>`${users.plexUserId} is not null`,
  jellyfinLinked: sql<boolean>`${users.jellyfinUserId} is not null`,
  hasPassword: sql<boolean>`${users.passwordHash} is not null`,
  lastActiveAt: users.lastActiveAt,
};

/** Admins see every account (they're the ones who can edit/remove others);
 * members only ever see their own row, so household members can't see who
 * else lives in the house. */
export async function listHouseholdMembersFor(actor: Actor): Promise<HouseholdMember[]> {
  const rows = await db.select(memberColumns).from(users).orderBy(asc(users.createdAt));

  if (actor.isAdmin) return rows;
  return rows.filter((r) => r.id === actor.userId);
}

export async function getHouseholdMember(userId: string): Promise<HouseholdMember | null> {
  const [row] = await db.select(memberColumns).from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, _ . -");

const createUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(80).optional(),
});

/** Adding another household member's account — the only way to create an
 * account once initial setup is done, since there's no public signup page.
 * Caller must already have verified the actor is the admin. */
export async function createHouseholdMember(input: {
  username: unknown;
  password: unknown;
  displayName: unknown;
}): Promise<CoreResult<{ userId: string }>> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { username, password, displayName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) {
    return fail("conflict", "An account with that username already exists");
  }

  const passwordHash = await hash(password);
  const [created] = await db
    .insert(users)
    .values({ username, passwordHash, displayName })
    .returning({ id: users.id });

  return { ok: true, userId: created.id };
}

const updateMemberSchema = z.object({
  userId: z.string().min(1),
  username: usernameSchema,
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  displayName: z.string().max(80).optional(),
});

/** Edits a household member's username/name, and resets their password if a
 * new one is given — the only account-recovery path here, since there's no
 * email-based "forgot password" flow. Members may only edit their own
 * account; only the admin may edit anyone else's. A password change signs
 * every native client of that account out (its API tokens are revoked) and
 * stops its browsers' push notifications.
 *
 * Changing your *own* password also takes `currentPassword`, so a browser
 * left signed in (or a stolen session cookie) can't be used to lock the
 * owner out of their account. The admin resetting someone else's password
 * doesn't need theirs — that's the household's only recovery path — and an
 * account that has no password yet (made by Plex/Jellyfin sign-in) sets
 * its first one without. */
export async function updateHouseholdMember(
  actor: Actor,
  input: {
    userId: unknown;
    username: unknown;
    password: unknown;
    /** Required when `password` is set on the actor's own account. */
    currentPassword?: unknown;
    displayName: unknown;
    /** Admin-only; ignored when the actor isn't the admin. Omit to leave unchanged. */
    autoApproveMovies?: boolean;
    autoApproveTv?: boolean;
  },
): Promise<CoreResult<{ passwordChanged: boolean }>> {
  if (!actor.isAdmin && input.userId !== actor.userId) {
    return fail("forbidden", "You can only edit your own account.");
  }

  const parsed = updateMemberSchema.safeParse({
    userId: input.userId,
    username: input.username,
    password: input.password,
    displayName: input.displayName,
  });

  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { userId, username, password, displayName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing && existing.id !== userId) {
    return fail("conflict", "An account with that username already exists");
  }

  if (password && userId === actor.userId) {
    const check = await verifyCurrentPassword(userId, input.currentPassword);
    if (!check.ok) return check;
  }

  // Auto-approval is an admin-only setting on other members' accounts —
  // never let a member grant it to themselves via this same "edit my own
  // account" form.
  const updated = await db
    .update(users)
    .set({
      username,
      displayName,
      ...(password ? { passwordHash: await hash(password), passwordChangedAt: new Date() } : {}),
      ...(actor.isAdmin && input.autoApproveMovies !== undefined
        ? { autoApproveMovies: input.autoApproveMovies }
        : {}),
      ...(actor.isAdmin && input.autoApproveTv !== undefined ? { autoApproveTv: input.autoApproveTv } : {}),
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (updated.length > 0 && password) {
    await revokeAllApiTokensForUser(userId);
    await removeAllSubscriptions(userId);
  }

  return { ok: true, passwordChanged: updated.length > 0 && Boolean(password) };
}

const PASSWORD_CHANGE_LIMIT = 5;
const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;

/** The current-password check for changing your own password. Budgeted like
 * sign-in (lib/auth/password-login.ts): the attempt is counted before the
 * argon2 check and refunded when it passes, so parallel guesses can't all
 * slip under the limit, and a correct password costs nothing. */
async function verifyCurrentPassword(userId: string, currentPassword: unknown): Promise<CoreResult> {
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  // An account made by Plex/Jellyfin sign-in has no password to confirm:
  // setting its first one needs only the session.
  if (row && !row.passwordHash) return { ok: true };

  if (typeof currentPassword !== "string" || !currentPassword) {
    return fail("invalid", "Enter your current password to set a new one.");
  }

  const key = `password-change:${userId}`;
  if (isRateLimited(key, PASSWORD_CHANGE_LIMIT)) {
    return fail("rate_limited", "Too many attempts. Try again in a few minutes.");
  }
  recordFailedAttempt(key, PASSWORD_CHANGE_WINDOW_MS);

  if (!row?.passwordHash || !(await verify(row.passwordHash, currentPassword))) {
    return fail("invalid", "Your current password is incorrect.");
  }

  refundAttempt(key);
  return { ok: true };
}

/** Removes a household member's account entirely — admin-only (caller must
 * have verified). Their favorites, requests, integration credentials, API
 * tokens, etc. cascade-delete with them (see the users FKs in schema.ts). */
export async function deleteHouseholdMember(adminUserId: string, userId: string): Promise<CoreResult> {
  if (!userId) return fail("invalid", "Invalid request.");
  if (userId === adminUserId) return fail("forbidden", "You can't remove your own account.");

  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return fail("not_found", "Account not found.");
  if (target.role === "admin") return fail("forbidden", "Can't remove the admin account.");

  await db.delete(users).where(eq(users.id, userId));
  return { ok: true };
}
