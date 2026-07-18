"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { approveAllRequestsAction } from "@/lib/requests/actions";

export function ApproveAllRequestsButton() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(approveAllRequestsAction, undefined);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Approving…" : "Approve all"}
      </button>
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
    </form>
  );
}
