"use client";

import { startTransition, useActionState, useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { rejectRequestAction } from "@/lib/requests/actions";
import {
  CUSTOM_REJECTION_REASON,
  REJECTION_REASON_CODES,
  REJECTION_REASON_MAX_LENGTH,
  rejectionReasonText,
} from "@/lib/requests/rejection-reasons";
import { useT } from "@/lib/i18n/client";
import { RequestCard } from "@/components/request-card";

const outlineBase = "rounded-full border border-border-strong px-3 text-xs text-text-primary transition-colors disabled:opacity-60";
const outlineButton = `${outlineBase} py-1.5`;

/** The reason presets and "Other" with its text box, as radios named
 * `reason` and a `customReason` input — what rejectRequestAction and the
 * Remove dialog read (resolveRejectionReason). `optional` adds "No reason"
 * first, for a dialog where saying why is up to the admin. */
export function ReasonChoices({
  reason,
  onReasonChange,
  customReason,
  onCustomReasonChange,
  optional = false,
}: {
  reason: string;
  onReasonChange: (reason: string) => void;
  customReason: string;
  onCustomReasonChange: (text: string) => void;
  optional?: boolean;
}) {
  const t = useT();
  const choices = [...(optional ? [""] : []), ...REJECTION_REASON_CODES, CUSTOM_REJECTION_REASON];
  return (
    <>
      {choices.map((preset) => (
        <label key={preset || "none"} className="flex items-center gap-2 text-text-primary">
          <input
            type="radio"
            name="reason"
            value={preset}
            checked={reason === preset}
            onChange={() => onReasonChange(preset)}
            className="h-4 w-4 border-border accent-accent"
          />
          {preset === ""
            ? t("requests.reasonNone")
            : preset === CUSTOM_REJECTION_REASON
              ? t("requests.reasonOther")
              : rejectionReasonText(t, preset as (typeof REJECTION_REASON_CODES)[number])}
        </label>
      ))}
      {reason === CUSTOM_REJECTION_REASON && (
        <input
          type="text"
          name="customReason"
          value={customReason}
          onChange={(e) => onCustomReasonChange(e.target.value)}
          maxLength={REJECTION_REASON_MAX_LENGTH}
          placeholder={t("requests.tellThemWhy")}
          autoFocus
          className="rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
        />
      )}
    </>
  );
}

/** Decline's second step, wherever a request can be declined (the review
 * queue, Couldn't add, and "Can't get it" on an approved one): pick why,
 * then "Decline request". A reason is required here — the requester sees it
 * on their Requests page and in the notification (the server action
 * re-checks either way). */
export function DeclineReasonForm({
  requesterName,
  busy,
  declining,
  onDecline,
  onCancel,
  className = "",
}: {
  requesterName: string;
  /** Anything on the row is running: the buttons wait. */
  busy: boolean;
  /** The decline itself is running. */
  declining: boolean;
  onDecline: (formData: FormData) => void;
  onCancel: () => void;
  className?: string;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const canDecline = reason === CUSTOM_REJECTION_REASON ? customReason.trim().length > 0 : reason.length > 0;

  // Submitted by hand instead of through the form's `action` prop. React
  // resets a form after every action it runs for it, and that reset unchecks
  // the controlled radios (the browser falls back to their mount-time
  // defaultChecked, which is false) while `reason` still holds the choice. A
  // failed decline would then show no selection next to an enabled button,
  // and retrying would post no reason at all. The caller runs the action in
  // its own transition, which skips that reset, and useActionState's
  // pending/error state still updates as before.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onDecline(new FormData(e.currentTarget));
  }

  return (
    <form
      onSubmit={submit}
      className={`flex max-w-xs flex-col gap-2 rounded-xl border border-border bg-bg-1 p-3 text-xs ${className}`}
    >
      <p className="text-text-secondary">{t("requests.letThemKnowWhy", { name: requesterName })}</p>
      <ReasonChoices
        reason={reason}
        onReasonChange={setReason}
        customReason={customReason}
        onCustomReasonChange={setCustomReason}
      />
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={busy || !canDecline}
          className={`${outlineButton} hover:border-red-400 hover:text-red-400`}
        >
          {declining ? t("requests.declining") : t("requests.declineRequest")}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={`${outlineButton} hover:border-accent hover:text-accent`}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/** "Can't get it" on an approved request (a reviewer's Past requests, and
 * Can't find): declines it after all, through the same reason chooser —
 * its requester hears it couldn't be added (rejectRequest). The button and
 * the chooser are rendered by the caller, where they fit its layout. */
export function useCantGetIt(requestId: string) {
  const router = useRouter();
  const [state, action, declining] = useActionState(rejectRequestAction.bind(null, requestId), undefined);
  const [choosing, setChoosing] = useState(false);
  const done = Boolean(state?.success);
  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);
  return {
    choosing,
    open: () => setChoosing(true),
    close: () => setChoosing(false),
    decline: (formData: FormData) => startTransition(() => action(formData)),
    declining,
    done,
    error: state?.error ?? null,
  };
}

/** The "Can't get it" button itself; `compact` matches Can't find's smaller buttons. */
export function CantGetItButton({
  requesterName,
  disabled,
  onClick,
  compact = false,
}: {
  requesterName: string;
  disabled: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={t("requests.cantGetItHint", { name: requesterName })}
      className={`${outlineBase} ${compact ? "py-1" : "py-1.5"} hover:border-red-400 hover:text-red-400`}
    >
      {t("requests.cantGetIt")}
    </button>
  );
}

/** A reviewer's Past requests card for an approved request that's still on
 * the server, with "Can't get it". */
export function CantGetItRequestCard({ requesterName, ...card }: ComponentProps<typeof RequestCard> & { requesterName: string }) {
  const decline = useCantGetIt(card.id);
  // Once declined it stays put until the refresh redraws it as Declined.
  const choosing = decline.choosing && !decline.done;
  return (
    <RequestCard
      {...card}
      actions={
        <CantGetItButton
          requesterName={requesterName}
          disabled={decline.declining || choosing || decline.done}
          onClick={decline.open}
        />
      }
      below={
        choosing || decline.error ? (
          <>
            {choosing && (
              <DeclineReasonForm
                requesterName={requesterName}
                busy={decline.declining}
                declining={decline.declining}
                onDecline={decline.decline}
                onCancel={decline.close}
              />
            )}
            {decline.error && <p className="mt-1.5 max-w-xs text-xs text-red-400">{decline.error}</p>}
          </>
        ) : undefined
      }
    />
  );
}
