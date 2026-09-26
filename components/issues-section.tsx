"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteIssueAction, resolveIssueAction, searchAgainAction } from "@/lib/issues/actions";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { Issue } from "@/lib/api/types";

const smallButton =
  "rounded-full border border-border-strong px-3 py-1 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

function IssueCard({ issue, isAdmin }: { issue: Issue; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const src = tmdbImageUrl(issue.posterPath, "w92");

  async function run(name: string, action: () => Promise<{ error?: string }>, after?: string) {
    setBusy(name);
    setError(null);
    setInfo(null);
    const result = await action();
    setBusy(null);
    if (result.error) setError(result.error);
    else if (after) setInfo(after);
    else router.refresh();
  }

  const who = issue.reportedBy.label;
  return (
    <li className="flex gap-3 px-4 py-3 text-sm">
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
        {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/title/${issue.mediaType}/${issue.tmdbId}`} className="font-medium text-text-primary hover:text-accent">
            {issue.title}
          </Link>
          {issue.episodeLabel && <span className="text-xs text-text-muted">{issue.episodeLabel}</span>}
        </div>
        <p className="mt-0.5 text-text-secondary">
          {issue.kindLabel}
          {isAdmin && <span className="text-text-muted"> · {who}</span>}
          <span className="text-text-muted"> · {new Date(issue.createdAt).toLocaleDateString()}</span>
        </p>
        {issue.message && <p className="mt-1 whitespace-pre-line text-text-secondary">“{issue.message}”</p>}
        {issue.status === "resolved" && (
          <p className="mt-1 text-xs text-owned">Fixed{issue.resolution ? `: ${issue.resolution}` : ""}</p>
        )}
        {resolving && (
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for them (optional), e.g. Replaced the file"
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg-0 px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("resolve", () => resolveIssueAction(issue.id, note))}
              className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg-0 hover:bg-accent-hover disabled:opacity-60"
            >
              {busy === "resolve" ? "Saving…" : "Mark fixed"}
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        {info && <p className="mt-1 text-xs text-owned">{info}</p>}
      </div>
      {issue.status === "open" && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isAdmin && !resolving && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("search", () => searchAgainAction(issue.id), "Searching for another copy…")}
                className={smallButton}
              >
                {busy === "search" ? "Searching…" : "Search again"}
              </button>
              <button type="button" onClick={() => setResolving(true)} className={smallButton}>
                Mark fixed
              </button>
            </>
          )}
          {(issue.isMine || isAdmin) && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("delete", () => deleteIssueAction(issue.id))}
              className="text-xs text-text-muted hover:text-red-400 disabled:opacity-60"
            >
              {issue.isMine && !isAdmin ? "Withdraw" : "Remove"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** "Reported problems" on the Requests page: the admin's open reports (and
 * the latest fixed ones), or a member's own. */
export function IssuesSection({ issues, isAdmin }: { issues: Issue[]; isAdmin: boolean }) {
  const open = issues.filter((i) => i.status === "open");
  const fixed = issues.filter((i) => i.status === "resolved");
  const [showFixed, setShowFixed] = useState(false);
  if (issues.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl text-text-primary">{isAdmin ? "Reported problems" : "Your problem reports"}</h2>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nothing open right now.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {open.map((issue) => (
            <IssueCard key={issue.id} issue={issue} isAdmin={isAdmin} />
          ))}
        </ul>
      )}
      {fixed.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowFixed((v) => !v)}
            className="mt-3 text-xs text-text-secondary hover:text-accent"
          >
            {showFixed ? "Hide fixed" : `Show fixed (${fixed.length})`}
          </button>
          {showFixed && (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border opacity-80">
              {fixed.map((issue) => (
                <IssueCard key={issue.id} issue={issue} isAdmin={isAdmin} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
