// Pure status-label logic for the Requests page — dependency-free so it can
// be unit tested, and shared with /api/v1/requests so native clients show
// exactly the same wording.
import type { LibraryStatus } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/db/schema";

export type MyRequestBadgeTone = "pending" | "declined" | "owned" | "downloading" | "coming_soon" | "approved";

/** A member's own request, as the "Status" column on their Requests page
 * labels it — approved requests are refined by live library status. */
export function myRequestBadge(
  status: RequestStatus,
  libraryStatus: LibraryStatus | null,
  manuallyApproved: boolean,
): { label: string; tone: MyRequestBadgeTone } {
  if (status === "pending") return { label: "Pending review", tone: "pending" };
  if (status === "rejected") return { label: "Declined", tone: "declined" };
  // approved
  if (libraryStatus === "owned") return { label: "In your library", tone: "owned" };
  if (libraryStatus === "tracked_downloading") return { label: "Downloading", tone: "downloading" };
  if (libraryStatus === "coming_soon") return { label: "Coming soon", tone: "coming_soon" };
  // Sonarr/Radarr never actually took this one — the admin is adding it by
  // hand, so it'll never resolve to a real libraryStatus on its own.
  if (manuallyApproved) return { label: "Manually approved", tone: "approved" };
  return { label: "Approved", tone: "approved" };
}

/** An already-reviewed request in the admin's "Past requests" table. */
export function reviewedRequestLabel(status: RequestStatus, manuallyApproved: boolean): string {
  if (status === "approved") return manuallyApproved ? "Manually approved" : "Approved";
  return "Rejected";
}
