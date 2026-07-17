import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPendingRequests } from "@/lib/requests/query";
import { RequestReviewRow } from "@/components/request-review-row";

export default async function RequestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/library");

  const pending = await getPendingRequests();

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
    </div>
  );
}
