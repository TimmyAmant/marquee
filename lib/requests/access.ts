import { getFailedRequestCount, getPendingRequestCount } from "@/lib/requests/query";
import { getOpenIssueCount } from "@/lib/issues";
import { getNotFoundCount } from "@/lib/requests/not-found";
import { can, type PermissionSubject } from "@/lib/users/permissions";

// What's waiting on the Requests page for this account, counted only where
// they may act on it (lib/users/permissions.ts): requests to review, Can't
// find and Couldn't add for whoever reviews requests, open problem reports
// for whoever handles them.

/** English, for callers without a reader's language; the website uses
 * the notify.advancedNotAllowed message. */
export const ADVANCED_REFUSED = "Picking the server, quality or folder isn't turned on for your account.";

export type AttentionCounts = {
  pendingRequests: number;
  openIssues: number;
  notFoundRequests: number;
  failedRequests: number;
};

export async function attentionCounts(user: PermissionSubject): Promise<AttentionCounts> {
  const reviews = can(user, "reviewRequests");
  const handlesIssues = can(user, "manageIssues");
  const [pendingRequests, openIssues, notFoundRequests, failedRequests] = await Promise.all([
    reviews ? getPendingRequestCount() : 0,
    handlesIssues ? getOpenIssueCount() : 0,
    reviews ? getNotFoundCount() : 0,
    reviews ? getFailedRequestCount() : 0,
  ]);
  return { pendingRequests, openIssues, notFoundRequests, failedRequests };
}

/** All of them together — the nav's Requests badge. */
export async function attentionCount(user: PermissionSubject): Promise<number> {
  const counts = await attentionCounts(user);
  return counts.pendingRequests + counts.openIssues + counts.notFoundRequests + counts.failedRequests;
}
