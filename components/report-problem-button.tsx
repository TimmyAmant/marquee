"use client";

import { useRef, useState } from "react";
import { reportIssueAction } from "@/lib/issues/actions";
import { issueKindLabel } from "@/lib/issues/labels";
import { useT } from "@/lib/i18n/client";
import { PILL_NOTE, PILL_OUTLINE } from "@/components/pill-styles";
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
  const t = useT();
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
      setError(t("title.reportPickKind"));
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

  // Another episode can still be reported while one report is open.
  const reported = sent || openReports > 0;

  return (
    <>
      {reported && (
        <span className={PILL_NOTE}>
          {t("title.problemReported")}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
        className={PILL_OUTLINE}
      >
        {reported ? t("title.reportAnother") : t("title.reportProblem")}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-1 p-0 text-text-primary backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 p-6">
          <div>
            <h3 className="font-display text-xl">{t("title.reportProblem")}</h3>
            <p className="mt-1 text-sm text-text-secondary">
              {t("title.reportProblemHelp")}
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
                {issueKindLabel(t, k)}
              </label>
            ))}
          </div>
          {mediaType === "tv" && seasonNumbers.length > 0 && (
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
                {t("title.seasonOptional")}
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t("title.wholeShow")}</option>
                  {seasonNumbers.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? t("title.specials") : t("common.season", { number: n })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex w-28 flex-col gap-1.5 text-sm text-text-secondary">
                {t("title.episode")}
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
            {kind === "other" ? t("title.whatsWrong") : t("title.anythingElse")}
            <textarea
              value={message}
              maxLength={1000}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("title.reportPlaceholder")}
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
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? t("title.sending") : t("title.sendReport")}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
