import { auth } from "@/auth";

export type RequireAdminResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Single choke point for "only the admin can do this" server actions —
 * previously each action re-implemented `if (session.user.role !== "admin")
 * return { error: ... }` inline, which meant a new admin-only action could
 * easily ship without the check. Callers that also allow "or the user
 * acting on their own account" (e.g. editing your own profile) still need
 * their own session check — this is only for the admin-exclusive case.
 */
export async function requireAdmin(message = "Only the admin can do this."): Promise<RequireAdminResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in required." };
  if (session.user.role !== "admin") return { ok: false, error: message };
  return { ok: true, userId: session.user.id };
}
