import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPendingRequests, getReviewedRequests } from "@/lib/requests/query";
import { RequestReviewRow } from "@/components/request-review-row";
import { tmdbImageUrl } from "@/lib/tmdb/image";

export default async function RequestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/library");

  const [pending, reviewed] = await Promise.all([
    getPendingRequests(session.user.id),
    getReviewedRequests(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">Requests</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Titles household members have asked you to add.
      </p>

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
              requestedByEmail={r.requestedByEmail}
              createdAt={r.createdAt.toISOString()}
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
                      Requested by {r.requestedByName || r.requestedByEmail} ·{" "}
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
                    {r.status === "approved" ? "Approved" : "Rejected"}
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
