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
      <div className="mx-auto max-w-4xl px-6 py-12">
        {myRequests.length === 0 ? (
          <p className="text-sm text-text-muted">
            You haven&apos;t requested anything yet — find a title and hit Request.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-bg-1 text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {myRequests.map((r) => {
                  const src = tmdbImageUrl(r.posterPath, "w92");
                  const badge = myRequestBadge(r.status, r.libraryStatus, r.manuallyApproved);
                  return (
                    <tr key={r.id} className="hover:bg-bg-1/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
                            {src && (
                              <Image src={src} alt="" fill sizes="40px" className="object-cover" />
                            )}
                          </div>
                          <Link
                            href={`/title/${r.mediaType}/${r.tmdbId}`}
                            className="text-sm font-medium text-text-primary hover:text-accent"
                          >
                            {r.title}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
    <div className="mx-auto max-w-5xl px-6 py-12">
      {pending.length > 1 && (
        <div className="flex justify-end">
          <ApproveAllRequestsButton />
        </div>
      )}

      {pending.length === 0 ? (
        <p className="text-sm text-text-muted">No pending requests.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-bg-1 text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Requested by</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((r) => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewed.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-xl text-text-primary">Past requests</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-bg-1 text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reviewed.map((r) => {
                  const src = tmdbImageUrl(r.posterPath, "w92");
                  return (
                    <tr key={r.id} className="hover:bg-bg-1/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
                            {src && (
                              <Image src={src} alt="" fill sizes="40px" className="object-cover" />
                            )}
                          </div>
                          <Link
                            href={`/title/${r.mediaType}/${r.tmdbId}`}
                            className="text-sm font-medium text-text-primary hover:text-accent"
                          >
                            {r.title}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {r.requestedByName || r.requestedByUsername}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
