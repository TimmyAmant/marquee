"use client";

import { useFormStatus } from "react-dom";
import { disablePush } from "@/lib/push/browser";
import { clearSearchHistory } from "@/lib/search/recent";
import { useT } from "@/lib/i18n/client";

export function SignOutButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      disabled={pending}
      // Stop this browser's notifications while the session still exists
      // (the server only forgets a subscription for its own account), then
      // submit the sign-out form. This browser's search history goes too.
      onClick={async (e) => {
        const form = e.currentTarget.form;
        clearSearchHistory();
        await disablePush().catch(() => undefined);
        form?.requestSubmit();
      }}
      className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
    >
      {pending ? t("settings.signingOut") : t("settings.signOut")}
    </button>
  );
}
