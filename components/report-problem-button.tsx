"use client";

import { useRef, useState } from "react";
import { reportIssueAction } from "@/lib/issues/actions";
import { ISSUE_KIND_LABELS } from "@/lib/issues/labels";
import {
  issueKindValues,
  type IssueKind,
  type MediaType,
} from "@/lib/db/schema";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent";

/** The title page's "Report a problem": what's wrong, which episode (TV),
 * and a note. The admin is told and sees it on the Requests page. */
export function ReportProblemButton({
  mediaType,
  tmdbId,
  seasonNumbers,
  openReports,
}: {
  mediaType: MediaType;
  tmdbId: number;
  /** A show's seasons, for the season picker. Empty for a movie. */
  seasonNumbers: number[];
  openReports: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<IssueKind | null>(null);
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!kind) {
      setError("Pick what's wrong.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await reportIssueAction(mediaType, tmdbId, {
      kind,
      message,
      seasonNumber: season || null,
      episodeNumber: episode || null,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
    dialogRef.current?.close();
  }

  if (sent || openReports > 0) {
    return (
      <span className="flex h-8 items-center rounded-full border border-border px-3.5 text-[13px] text-text-secondary">
        Problem reported
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
        className="flex h-8 items-center rounded-full border border-border-strong px-3.5 text-[13px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        Report a problem
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-1 p-0 text-text-primary backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 p-6">
          <div>
            <h3 className="font-display text-xl">Report a problem</h3>
            <p className="mt-1 text-sm text-text-secondary">
              The admin is told, and you&apos;ll hear back when it&apos;s fixed.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {issueKindValues.map((k) => (
              <label
                key={k}
                className="flex items-center gap-2 text-sm text-text-secondary"
              >
                <input
                  type="radio"
                  name="kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="h-4 w-4 accent-accent"
                />
                {ISSUE_KIND_LABELS[k]}
              </label>
            ))}
          </div>
          {mediaType === "tv" && seasonNumbers.length > 0 && (
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
                Season (optional)
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Whole show</option>
                  {seasonNumbers.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Specials" : `Season ${n}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex w-28 flex-col gap-1.5 text-sm text-text-secondary">
                Episode
                <input
                  type="number"
                  min={1}
                  value={episode}
                  disabled={!season}
                  onChange={(e) => setEpisode(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            {kind === "other" ? "What's wrong?" : "Anything else? (optional)"}
            <textarea
              value={message}
              maxLength={1000}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. The audio drifts out of sync after about 20 minutes."
              className={inputClass}
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
