"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { dismissNotFoundAction, searchNotFoundAgainAction } from "@/lib/requests/actions";
import { notFoundAgeLabel } from "@/lib/requests/not-found-rules";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { NotFoundRequest } from "@/lib/api/types";

const smallButton =
  "rounded-full border border-border-strong px-3 py-1 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

function NotFoundCard({ request }: { request: NotFoundRequest }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"search" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const src = tmdbImageUrl(request.posterPath, "w92");
  const kind = request.server.kind === "radarr" ? "Radarr" : "Sonarr";
  const since = new Date(request.notFoundSince);
  const extra = [request.seasonsLabel, request.is4k ? "In 4K" : null].filter(Boolean).join(" · ");

  async function run(name: "search" | "dismiss") {
    setBusy(name);
    setError(null);
    setInfo(null);
    const result = name === "search" ? await searchNotFoundAgainAction(request.id) : await dismissNotFoundAction(request.id);
    setBusy(null);
    if (result.error) setError(result.error);
    else if (name === "search") setInfo(`${request.server.name ?? kind} is searching again…`);
    else router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row">
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
          {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link
              href={`/title/${request.mediaType}/${request.tmdbId}`}
              className="font-medium text-text-primary hover:text-accent"
            >
              {request.title}
            </Link>
            {extra && <span className="text-xs text-text-muted">{extra}</span>}
          </div>
          <p className="mt-0.5 text-text-secondary">
            {request.requestedBy.label}
            <span className="text-text-muted">
              {" "}
              · can&apos;t find for {notFoundAgeLabel(since, new Date())}
              <span title={since.toLocaleString()}> (since {since.toLocaleDateString()})</span>
              {request.server.name && <> · {request.server.name}</>}
            </span>
          </p>
          <p className="mt-1 text-xs text-text-muted">{request.hint}</p>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          {info && <p className="mt-1 text-xs text-owned">{info}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-start gap-1.5 sm:flex-col sm:items-end">
        <button type="button" disabled={busy !== null} onClick={() => run("search")} className={smallButton}>
          {busy === "search" ? "Searching…" : "Search again"}
        </button>
        {request.arrUrl && (
          <a href={request.arrUrl} target="_blank" rel="noreferrer" className={smallButton}>
            Open in {kind}
          </a>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("dismiss")}
          className="px-1 py-1 text-xs text-text-muted hover:text-accent disabled:opacity-60"
        >
          {busy === "dismiss" ? "Saving…" : "Mark as found"}
        </button>
      </div>
    </li>
  );
}

/** "Can't find" on the reviewers' Requests page: approved requests
 * Sonarr/Radarr hasn't found a release for (lib/requests/not-found.ts). */
export function NotFoundSection({ requests, afterHours }: { requests: NotFoundRequest[]; afterHours: number }) {
  if (requests.length === 0) return null;
  return (
    <section id="cant-find" className="mt-12 scroll-mt-6">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-display text-xl text-text-primary">Can&apos;t find</h2>
        <span className="rounded-full bg-missing-bg px-2 py-0.5 text-xs font-medium text-missing">{requests.length}</span>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Approved and released, but Sonarr/Radarr still has nothing {afterHours} hour{afterHours === 1 ? "" : "s"} or more
        after approval. Most often no indexer has a copy yet.
      </p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {requests.map((request) => (
          <NotFoundCard key={request.id} request={request} />
        ))}
      </ul>
    </section>
  );
}
