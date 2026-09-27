import { auth } from "@/auth";
import { can, type Permission } from "@/lib/users/permissions";
import { getT } from "@/lib/i18n/server";

export type RequireAdminResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Single choke point for "only the admin can do this" server actions —
 * previously each action re-implemented `if (session.user.role !== "admin")
 * return { error: ... }` inline, which meant a new admin-only action could
 * easily ship without the check. Callers that also allow "or the user
 * acting on their own account" (e.g. editing your own profile) still need
 * their own session check — this is only for the admin-exclusive case.
 */
export async function requireAdmin(message?: string): Promise<RequireAdminResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: (await getT())("server.signInRequired") };
  if (session.user.role !== "admin") return { ok: false, error: message ?? (await getT())("server.adminOnly") };
  return { ok: true, userId: session.user.id };
}

/** The signed-in account may do `permission` (lib/users/permissions.ts) —
 * always the admin, otherwise whoever has that switch on. Read fresh from
 * the database on every request (see the jwt callback in auth.ts). */
export async function requirePermission(permission: Permission, message: string): Promise<RequireAdminResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: (await getT())("server.signInRequired") };
  if (!can(session.user, permission)) return { ok: false, error: message };
  return { ok: true, userId: session.user.id };
}
