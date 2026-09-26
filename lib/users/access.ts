import { eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { Permission, PermissionSubject } from "@/lib/users/permissions";

// The database side of lib/users/permissions.ts: an account's role and
// switches read fresh, and "everyone who may do X" for the alerts that go
// to reviewers.

export type Access = PermissionSubject & { role: string; permissions: string[] };

/** This account's role and switches, straight from the database; null when
 * it doesn't exist. */
export async function getAccess(userId: string): Promise<Access | null> {
  const [row] = await db
    .select({ role: users.role, permissions: users.permissions })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** Everyone who may do `permission` — the admin first: the admin's copy of
 * an alert is the one relayed to the household channels, so those hear
 * about it once. */
export async function usersWhoCan(permission: Permission): Promise<{ id: string; role: string }[]> {
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(
      or(
        eq(users.role, "admin"),
        sql`${permission} = any(${users.permissions})`,
        // can(): reviewing requests brings seeing them along.
        permission === "viewRequests" ? sql`'reviewRequests' = any(${users.permissions})` : undefined,
      ),
    );
  return rows.sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : 0));
}
