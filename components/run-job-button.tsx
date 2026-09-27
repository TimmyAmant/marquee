"use client";

import { useActionState } from "react";
import { runJobAction, type JobId } from "@/app/settings/jobs/actions";
import { useT } from "@/lib/i18n/client";

export function RunJobButton({ jobId }: { jobId: JobId }) {
  const t = useT();
  const action = runJobAction.bind(null, jobId);
  const [state, formAction, isPending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      {state?.success && <span className="text-xs text-owned">{t("common.done")}</span>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {isPending ? t("admin.running") : t("admin.runNow")}
      </button>
    </form>
  );
}
