// Pure status-label logic for the Requests page — dependency-free so it can
// be unit tested, and shared with /api/v1/requests so native clients show
// exactly the same wording. Every label is in the language of the `t`
// passed in (tests pass englishT()).
import type { LibraryStatus } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/db/schema";
import type { Translator } from "@/lib/i18n/translator";

export type MyRequestBadgeTone = "pending" | "declined" | "owned" | "downloading" | "coming_soon" | "approved";

/** A member's own request, as the "Status" column on their Requests page
 * labels it — approved requests are refined by live library status. */
export function myRequestBadge(
  t: Translator,
  status: RequestStatus,
  libraryStatus: LibraryStatus | null,
  manuallyApproved: boolean,
  /** Approved, but Sonarr/Radarr couldn't be reached to add it yet
   * ("Couldn't add" on the reviewers' side, waiting for a Retry). */
  waitingToBeAdded = false,
): { label: string; tone: MyRequestBadgeTone } {
  if (status === "pending") return { label: t("requests.statusPendingReview"), tone: "pending" };
  if (status === "rejected") return { label: t("requests.statusDeclined"), tone: "declined" };
  // approved
  if (libraryStatus === "owned") return { label: t("requests.statusInLibrary"), tone: "owned" };
  if (libraryStatus === "tracked_downloading") return { label: t("requests.statusDownloading"), tone: "downloading" };
  if (libraryStatus === "coming_soon") return { label: t("requests.statusComingSoon"), tone: "coming_soon" };
  // Sonarr/Radarr never actually took this one — the admin is adding it by
  // hand, so it'll never resolve to a real libraryStatus on its own.
  if (manuallyApproved) return { label: t("requests.statusManuallyApproved"), tone: "approved" };
  if (waitingToBeAdded) return { label: t("requests.statusWaitingToBeAdded"), tone: "approved" };
  return { label: t("requests.statusApproved"), tone: "approved" };
}

/** An already-reviewed request in the admin's "Past requests" table. */
export function reviewedRequestLabel(t: Translator, status: RequestStatus, manuallyApproved: boolean): string {
  if (status === "approved") return t(manuallyApproved ? "requests.statusManuallyApproved" : "requests.statusApproved");
  return t("requests.statusRejected");
}

/** Groups a sorted, de-duplicated season list into runs, so 1, 2, 3, 5
 * reads as "1–3, 5". */
function seasonRuns(seasons: number[]): string[] {
  const runs: string[] = [];
  let start = seasons[0];
  let prev = seasons[0];
  for (const n of seasons.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    runs.push(start === prev ? String(start) : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  runs.push(start === prev ? String(start) : `${start}–${prev}`);
  return runs;
}

/** The seasons a request is for, as every list and notification words it:
 * "Season 2", "Seasons 1–3, 5", "Specials, Season 1". Null for a request
 * that covers the whole series (every movie, and every TV request made
 * before per-season requests existed), so callers show nothing extra. */
export function seasonsLabel(t: Translator, seasons: number[] | null): string | null {
  if (!seasons || seasons.length === 0) return null;
  const sorted = [...new Set(seasons)].sort((a, b) => a - b);
  const specials = sorted[0] === 0;
  const numbered = specials ? sorted.slice(1) : sorted;

  const parts: string[] = [];
  if (specials) parts.push(t("requests.seasonsSpecials"));
  if (numbered.length > 0) {
    parts.push(t("requests.seasonsList", { count: numbered.length, list: seasonRuns(numbered).join(", ") }));
  }
  return parts.join(", ");
}

/** `"Severance"`, or `"Severance" (Season 2)` for a season request: how
 * notifications name the title they're about. */
export function quotedRequestTitle(t: Translator, title: string, seasons: number[] | null): string {
  const label = seasonsLabel(t, seasons);
  return label
    ? t("requests.quotedTitleWithSeasons", { title, seasons: label })
    : t("requests.quotedTitle", { title });
}

/** The activity log keeps only a title, so a season request's entry carries
 * its seasons in that text: "Severance (Season 2)". */
export function activityRequestTitle(t: Translator, title: string, seasons: number[] | null): string {
  const label = seasonsLabel(t, seasons);
  return label ? t("requests.titleWithSeasons", { title, seasons: label }) : title;
}
