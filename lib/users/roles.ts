import type { UserRole } from "@/lib/db/schema";

// What each role may do beyond requesting. The admin runs everything; a
// trusted member also works the review queue — approving or declining
// other people's requests and handling problem reports — and has their own
// requests approved straight away, with no request limits. Settings,
// integrations and accounts stay the admin's alone.

export function canReviewRequests(role: UserRole | string | null | undefined): boolean {
  return role === "admin" || role === "trusted";
}

/** Request limits (lib/requests/quota.ts) apply to plain members only. */
export function hasRequestLimits(role: UserRole | string | null | undefined): boolean {
  return !canReviewRequests(role);
}
