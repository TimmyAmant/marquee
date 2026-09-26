import { hash, verify } from "argon2";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { revokeAllApiTokensForUser } from "@/lib/api/token-store";
import { removeAllSubscriptions } from "@/lib/push/deliver";
import { isRateLimited, recordFailedAttempt, refundAttempt } from "@/lib/rate-limit";
import {
  applyPermissionChanges,
  can,
  normalizePermissions,
  parsePermissionChanges,
  presetPermissions,
  storedPermissionFields,
} from "@/lib/users/permissions";

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
  /** The switches that are on (lib/users/permissions.ts); the admin's are
   * ignored — they can do everything. */
  permissions: string[];
  /** When the profile photo last changed; null when there's none (lib/users/avatar.ts). */
  avatarUpdatedAt: Date | null;
  createdAt: Date;
  /** Signs in with Plex / Jellyfin (lib/auth/media-signin.ts). Only
   * whether — the linked ids themselves stay on the server. */
  plexLinked: boolean;
  jellyfinLinked: boolean;
  ssoLinked: boolean;
  /** False for an account made by Plex/Jellyfin sign-in or import that
   * hasn't set a password yet. */
  hasPassword: boolean;
  /** Last time the account used the website or an app, to within a few
   * minutes (lib/users/last-active.ts); null when it never has. */
  lastActiveAt: Date | null;
  /** Request limits (lib/requests/quota.ts); a null limit is none. */
  movieQuotaLimit: number | null;
  movieQuotaDays: number;
  tvQuotaLimit: number | null;
  tvQuotaDays: number;
};

export type Actor = { userId: string; isAdmin: boolean };

const memberColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  autoApproveMovies: users.autoApproveMovies,
  autoApproveTv: users.autoApproveTv,
  permissions: users.permissions,
  avatarUpdatedAt: users.avatarUpdatedAt,
  createdAt: users.createdAt,
  plexLinked: sql<boolean>`${users.plexUserId} is not null`,
  jellyfinLinked: sql<boolean>`${users.jellyfinUserId} is not null`,
  ssoLinked: sql<boolean>`${users.ssoSubject} is not null`,
  hasPassword: sql<boolean>`${users.passwordHash} is not null`,
  lastActiveAt: users.lastActiveAt,
  movieQuotaLimit: users.movieQuotaLimit,
  movieQuotaDays: users.movieQuotaDays,
  tvQuotaLimit: users.tvQuotaLimit,
  tvQuotaDays: users.tvQuotaDays,
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
    /** Admin-only; ignored when the actor isn't the admin. Omit to leave
     * unchanged. From before permissions: movies (or TV) including their 4K
     * requests, applied only when it differs from what the account has. */
    autoApproveMovies?: boolean;
    autoApproveTv?: boolean;
    /** Admin-only, for another member's account: "member" or "trusted" —
     * fills in that preset's permissions, when it's a change. */
    role?: unknown;
    /** Admin-only, for another member's account: switches to change,
     * `{ "reviewRequests": true, "requestTv": false }` (lib/users/permissions.ts).
     * Applied after `role`. Refused from anyone but the admin. */
    permissions?: unknown;
    /** Admin-only request limits: a limit of null (or "") removes it. */
    movieQuotaLimit?: unknown;
    movieQuotaDays?: unknown;
    tvQuotaLimit?: unknown;
    tvQuotaDays?: unknown;
  },
): Promise<CoreResult<{ passwordChanged: boolean }>> {
  if (!actor.isAdmin && input.userId !== actor.userId) {
    return fail("forbidden", "You can only edit your own account.");
  }

  // Nobody but the admin changes what an account may do — not even their
  // own (lib/users/permissions.ts).
  if (input.permissions !== undefined && !actor.isAdmin) {
    return fail("forbidden", "Only the admin can change what someone may do.");
  }
  const adminFields = actor.isAdmin ? parseAdminFields(input) : { ok: true as const, set: {} };
  if (!adminFields.ok) return fail("invalid", adminFields.error);
  const { role: requestedRole, ...limitFields } = adminFields.set;
  const permissionChanges = input.permissions === undefined ? null : parsePermissionChanges(input.permissions);
  if (permissionChanges && !permissionChanges.ok) return fail("invalid", permissionChanges.error);
  if (requestedRole !== undefined || permissionChanges) {
    if (input.userId === actor.userId) {
      return fail("invalid", requestedRole !== undefined ? "You can't change your own role." : "You can't change your own permissions.");
    }
    if (typeof input.userId === "string") {
      const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (target?.role === "admin") {
        return fail("invalid", requestedRole !== undefined ? "The admin's role can't be changed." : "The admin can always do everything.");
      }
    }
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

  // Permissions are an admin-only setting on other members' accounts —
  // never let a member grant them to themselves via this same "edit my own
  // account" form.
  const permissionFields =
    actor.isAdmin && userId !== actor.userId
      ? await nextPermissions(userId, {
          role: requestedRole,
          autoApproveMovies: input.autoApproveMovies,
          autoApproveTv: input.autoApproveTv,
          changes: permissionChanges?.ok ? permissionChanges.changes : undefined,
        })
      : null;
  const updated = await db
    .update(users)
    .set({
      username,
      displayName,
      ...(password ? { passwordHash: await hash(password), passwordChangedAt: new Date() } : {}),
      ...limitFields,
      ...(permissionFields ?? {}),
    })
    // The admin's role and permissions are never changed here (nor anyone
    // made admin) — also guarded in the update itself.
    .where(permissionFields ? and(eq(users.id, userId), ne(users.role, "admin")) : eq(users.id, userId))
    .returning({ id: users.id });

  if (updated.length > 0 && password) {
    await revokeAllApiTokensForUser(userId);
    await removeAllSubscriptions(userId);
  }

  return { ok: true, passwordChanged: updated.length > 0 && Boolean(password) };
}

/** What a member's switches become after an admin's edit — null when
 * nothing about them changes (or it's the admin's own row). In order: a
 * preset ("member" / "trusted") when the role is a change, the old
 * auto-approve flags when they differ from what the account has (each
 * covers its type's 4K requests too, as it did), then the switches sent. */
async function nextPermissions(
  userId: string,
  edit: {
    role?: UserRole;
    autoApproveMovies?: boolean;
    autoApproveTv?: boolean;
    changes?: Partial<Record<string, boolean>>;
  },
): Promise<ReturnType<typeof storedPermissionFields> | null> {
  const [target] = await db
    .select({ role: users.role, permissions: users.permissions })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target || target.role === "admin") return null;

  const before = normalizePermissions(target.permissions);
  let next: string[] = before;
  if ((edit.role === "member" || edit.role === "trusted") && edit.role !== target.role) {
    next = presetPermissions(edit.role);
  }
  const legacy = (on: boolean | undefined, regular: "autoApproveMovies" | "autoApproveTv", fourK: "autoApprove4kMovies" | "autoApprove4kTv") => {
    if (on === undefined || on === can({ role: target.role, permissions: next }, regular)) return;
    next = applyPermissionChanges(next, { [regular]: on, [fourK]: on });
  };
  legacy(edit.autoApproveMovies, "autoApproveMovies", "autoApprove4kMovies");
  legacy(edit.autoApproveTv, "autoApproveTv", "autoApprove4kTv");
  if (edit.changes) next = applyPermissionChanges(next, edit.changes);

  const normalized = normalizePermissions(next);
  const same = normalized.length === before.length && normalized.every((p, i) => p === before[i]);
  return same ? null : storedPermissionFields(normalized);
}

type AdminFieldsInput = {
  role?: unknown;
  movieQuotaLimit?: unknown;
  movieQuotaDays?: unknown;
  tvQuotaLimit?: unknown;
  tvQuotaDays?: unknown;
};

/** The admin-only fields of a member edit: role and request limits.
 * Omitted fields stay as they are. Pure; unit tested. */
export function parseAdminFields(
  input: AdminFieldsInput,
): { ok: true; set: Partial<typeof users.$inferInsert> } | { ok: false; error: string } {
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.role !== undefined) {
    if (input.role !== "member" && input.role !== "trusted") return { ok: false, error: "Role is member or trusted." };
    set.role = input.role;
  }
  const limit = (value: unknown, label: string): number | null | "skip" | { error: string } => {
    if (value === undefined) return "skip";
    if (value === null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : { error: `${label} is a number from 1 to 1000, or blank for no limit.` };
  };
  const days = (value: unknown): number | "skip" | { error: string } => {
    if (value === undefined || value === null || value === "") return "skip";
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 365 ? n : { error: "The number of days is from 1 to 365." };
  };
  const pairs: [unknown, "movieQuotaLimit" | "tvQuotaLimit", string][] = [
    [input.movieQuotaLimit, "movieQuotaLimit", "The movie limit"],
    [input.tvQuotaLimit, "tvQuotaLimit", "The TV limit"],
  ];
  for (const [value, key, label] of pairs) {
    const parsed = limit(value, label);
    if (parsed === "skip") continue;
    if (parsed !== null && typeof parsed === "object") return { ok: false, error: parsed.error };
    set[key] = parsed;
  }
  for (const [value, key] of [
    [input.movieQuotaDays, "movieQuotaDays"],
    [input.tvQuotaDays, "tvQuotaDays"],
  ] as const) {
    const parsed = days(value);
    if (parsed === "skip") continue;
    if (typeof parsed === "object") return { ok: false, error: parsed.error };
    set[key] = parsed;
  }
  return { ok: true, set };
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
