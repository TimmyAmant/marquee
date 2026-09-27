import { getSsoButton } from "@/lib/auth/sso/config";
import { parseSsoErrorCode, ssoErrorMessage } from "@/lib/auth/sso/messages";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Where an app's SSO sign-in (or link) ends up in the browser: the app
 * itself finds out by polling, so this only says to go back to it. */
export default async function SsoDonePage({ searchParams }: { searchParams: Promise<{ result?: string | string[] }> }) {
  const { result } = await searchParams;
  const t = await getT();
  const name = (await getSsoButton())?.name ?? t("auth.singleSignOn");
  const ok = result === "signed_in" || result === "linked";
  const error = ok ? null : (parseSsoErrorCode(result) ?? "failed");

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-8">
      <h1 className="font-display text-2xl text-text-primary">
        {result === "signed_in"
          ? t("auth.doneSignedInTitle")
          : result === "linked"
            ? t("auth.doneLinkedTitle", { name })
            : t("auth.doneFailedTitle")}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {ok ? t("auth.doneBody") : ssoErrorMessage(error!, name, t)}
      </p>
    </div>
  );
}
