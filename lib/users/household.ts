import { hash, verify } from "argon2";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { englishT } from "@/lib/i18n/catalog";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, Translator } from "@/lib/i18n/translator";
import { displayNameSchema, firstIssueMessage, passwordSchema, usernameSchema } from "@/lib/users/account-rules";
import { revokeAllApiTokensForUser } from "@/lib/api/token-store";
import { MAX_QUOTA_DAYS, MAX_QUOTA_LIMIT } from "@/lib/requests/quota";
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

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
});

/** Adding another household member's account — the only way to create an
 * account once initial setup is done, since there's no public signup page.
 * Caller must already have verified the actor is the admin. */
export async function createHouseholdMember(input: {
  username: unknown;
  password: unknown;
  displayName: unknown;
}): Promise<CoreResult<{ userId: string }>> {
  const t = await getT();
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", firstIssueMessage(parsed.error, t));
  }

  const { username, password, displayName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) {
    return fail("conflict", t("server.usernameTaken"));
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
  password: passwordSchema.optional(),
  displayName: z.string().max(80, "server.displayNameTooLong" satisfies MessageKey).optional(),
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
  const t = await getT();
  if (!actor.isAdmin && input.userId !== actor.userId) {
    return fail("forbidden", t("server.onlyEditOwnAccount"));
  }

  // Nobody but the admin changes what an account may do — not even their
  // own (lib/users/permissions.ts).
  if (input.permissions !== undefined && !actor.isAdmin) {
    return fail("forbidden", t("server.onlyAdminPermissions"));
  }
  const adminFields = actor.isAdmin ? parseAdminFields(input, t) : { ok: true as const, set: {} };
  if (!adminFields.ok) return fail("invalid", adminFields.error);
  const { role: requestedRole, ...limitFields } = adminFields.set;
  const permissionChanges = input.permissions === undefined ? null : parsePermissionChanges(input.permissions, t);
  if (permissionChanges && !permissionChanges.ok) return fail("invalid", permissionChanges.error);
  if (requestedRole !== undefined || permissionChanges) {
    if (input.userId === actor.userId) {
      return fail("invalid", t(requestedRole !== undefined ? "server.cantChangeOwnRole" : "server.cantChangeOwnPermissions"));
    }
    if (typeof input.userId === "string") {
      const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (target?.role === "admin") {
        return fail("invalid", t(requestedRole !== undefined ? "server.adminRoleFixed" : "server.adminCanDoEverything"));
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
    return fail("invalid", firstIssueMessage(parsed.error, t));
  }

  const { userId, username, password, displayName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing && existing.id !== userId) {
    return fail("conflict", t("server.usernameTaken"));
  }

  if (password && userId === actor.userId) {
    const check = await verifyCurrentPassword(userId, input.currentPassword, t);
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
 * Omitted fields stay as they are. Pure; unit tested. Messages in `t`'s
 * language. */
export function parseAdminFields(
  input: AdminFieldsInput,
  t: Translator = englishT(),
): { ok: true; set: Partial<typeof users.$inferInsert> } | { ok: false; error: string } {
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.role !== undefined) {
    if (input.role !== "member" && input.role !== "trusted") return { ok: false, error: t("server.roleMemberOrTrusted") };
    set.role = input.role;
  }
  const limit = (value: unknown, rangeMessage: MessageKey): number | null | "skip" | { error: string } => {
    if (value === undefined) return "skip";
    if (value === null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) && n >= 1 && n <= MAX_QUOTA_LIMIT ? n : { error: t(rangeMessage) };
  };
  const days = (value: unknown): number | "skip" | { error: string } => {
    if (value === undefined || value === null || value === "") return "skip";
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) && n >= 1 && n <= MAX_QUOTA_DAYS ? n : { error: t("server.quotaDaysRange") };
  };
  const pairs: [unknown, "movieQuotaLimit" | "tvQuotaLimit", MessageKey][] = [
    [input.movieQuotaLimit, "movieQuotaLimit", "server.movieLimitRange"],
    [input.tvQuotaLimit, "tvQuotaLimit", "server.tvLimitRange"],
  ];
  for (const [value, key, rangeMessage] of pairs) {
    const parsed = limit(value, rangeMessage);
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
async function verifyCurrentPassword(userId: string, currentPassword: unknown, t: Translator): Promise<CoreResult> {
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  // An account made by Plex/Jellyfin sign-in has no password to confirm:
  // setting its first one needs only the session.
  if (row && !row.passwordHash) return { ok: true };

  if (typeof currentPassword !== "string" || !currentPassword) {
    return fail("invalid", t("server.currentPasswordNeeded"));
  }

  const key = `password-change:${userId}`;
  if (isRateLimited(key, PASSWORD_CHANGE_LIMIT)) {
    return fail("rate_limited", t("server.tooManyAttempts"));
  }
  recordFailedAttempt(key, PASSWORD_CHANGE_WINDOW_MS);

  if (!row?.passwordHash || !(await verify(row.passwordHash, currentPassword))) {
    return fail("invalid", t("server.currentPasswordWrong"));
  }

  refundAttempt(key);
  return { ok: true };
}

/** Removes a household member's account entirely — admin-only (caller must
 * have verified). Their favorites, requests, integration credentials, API
 * tokens, etc. cascade-delete with them (see the users FKs in schema.ts). */
export async function deleteHouseholdMember(adminUserId: string, userId: string): Promise<CoreResult> {
  const t = await getT();
  if (!userId) return fail("invalid", t("server.invalidRequest"));
  if (userId === adminUserId) return fail("forbidden", t("server.cantRemoveSelf"));

  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return fail("not_found", t("server.accountNotFound"));
  if (target.role === "admin") return fail("forbidden", t("server.cantRemoveAdmin"));

  await db.delete(users).where(eq(users.id, userId));
  return { ok: true };
}
