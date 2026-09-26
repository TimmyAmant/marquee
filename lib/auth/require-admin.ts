import { auth } from "@/auth";
import { canReviewRequests } from "@/lib/users/roles";

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

/** "The admin or a trusted member" — whoever works the review queue
 * (requests and problem reports; lib/users/roles.ts). */
export async function requireReviewer(message = "Only the admin can review requests."): Promise<RequireAdminResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in required." };
  if (!canReviewRequests(session.user.role)) return { ok: false, error: message };
  return { ok: true, userId: session.user.id };
}
