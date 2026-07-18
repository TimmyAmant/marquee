import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getPendingRequests, getReviewedRequests, getMyRequests } from "@/lib/requests/query";
import { RequestReviewRow } from "@/components/request-review-row";
import { ApproveAllRequestsButton } from "@/components/approve-all-requests-button";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getArrCredential } from "@/lib/integrations/credentials";
import type { LibraryStatus } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/db/schema";

function myRequestBadge(
  status: RequestStatus,
  libraryStatus: LibraryStatus | null,
  manuallyApproved: boolean,
): {
  label: string;
  className: string;
} {
  if (status === "pending") {
    return { label: "Pending review", className: "bg-tracked-bg text-tracked" };
  }
  if (status === "rejected") {
    return { label: "Declined", className: "bg-untracked-bg text-text-secondary" };
  }
  // approved
  if (libraryStatus === "owned") {
    return { label: "In your library", className: "bg-owned-bg text-owned" };
  }
  if (libraryStatus === "tracked_downloading") {
    return { label: "Downloading", className: "bg-tracked-bg text-tracked" };
  }
  if (libraryStatus === "coming_soon") {
    return { label: "Coming soon", className: "bg-untracked-bg text-text-secondary" };
  }
  // Sonarr/Radarr never actually took this one — the admin is adding it by
  // hand, so it'll never resolve to a real libraryStatus on its own.
  if (manuallyApproved) {
    return { label: "Manually approved", className: "bg-tracked-bg text-tracked" };
  }
  return { label: "Approved", className: "bg-tracked-bg text-tracked" };
}

export default async function RequestsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session) redirect("/login");

  if (!viewer.isAdmin) {
    const myRequests = await getMyRequests(viewer.userId, viewer.libraryOwnerId);

    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl text-text-primary">Requests</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Everything you&apos;ve asked the admin to add, and where it stands.
        </p>

        <div className="mt-8 flex flex-col gap-2">
          {myRequests.length === 0 ? (
            <p className="text-sm text-text-muted">
              You haven&apos;t requested anything yet — find a title and hit Request.
            </p>
          ) : (
            myRequests.map((r) => {
              const src = tmdbImageUrl(r.posterPath, "w92");
              const badge = myRequestBadge(r.status, r.libraryStatus, r.manuallyApproved);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-bg-1 p-3"
                >
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
                    {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/title/${r.mediaType}/${r.tmdbId}`}
                      className="text-sm font-medium text-text-primary hover:text-accent"
                    >
                      {r.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Requested {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Reconciliation checks library status against whichever account actually
  // holds the Sonarr/Radarr credentials — today that's always this admin,
  // but resolve properly rather than assuming session.user.id === owner, in
  // case a second admin account without its own integrations ever exists.
  const [pending, reviewed, sonarrCred] = await Promise.all([
    getPendingRequests(viewer.libraryOwnerId),
    getReviewedRequests(),
    getArrCredential(viewer.libraryOwnerId, "sonarr"),
  ]);
  const sonarrUrl = sonarrCred?.baseUrl ?? null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-text-primary">Requests</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Titles household members have asked you to add.
          </p>
        </div>
        {pending.length > 1 && <ApproveAllRequestsButton />}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {pending.length === 0 ? (
          <p className="text-sm text-text-muted">No pending requests.</p>
        ) : (
          pending.map((r) => (
            <RequestReviewRow
              key={r.id}
              id={r.id}
              mediaType={r.mediaType}
              tmdbId={r.tmdbId}
              title={r.title}
              posterPath={r.posterPath}
              requestedByName={r.requestedByName}
              requestedByUsername={r.requestedByUsername}
              createdAt={r.createdAt.toISOString()}
              sonarrUrl={sonarrUrl}
            />
          ))
        )}
      </div>

      {reviewed.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-xl text-text-primary">Past requests</h2>
          <div className="mt-4 flex flex-col gap-2">
            {reviewed.map((r) => {
              const src = tmdbImageUrl(r.posterPath, "w92");
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-bg-1 p-3"
                >
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
                    {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/title/${r.mediaType}/${r.tmdbId}`}
                      className="text-sm font-medium text-text-primary hover:text-accent"
                    >
                      {r.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Requested by {r.requestedByName || r.requestedByUsername} ·{" "}
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                      r.status === "approved"
                        ? "bg-owned-bg text-owned"
                        : "bg-untracked-bg text-text-secondary"
                    }`}
                  >
                    {r.status === "approved"
                      ? r.manuallyApproved
                        ? "Manually approved"
                        : "Approved"
                      : "Rejected"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
