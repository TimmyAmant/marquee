import { getSsoButton } from "@/lib/auth/sso/config";
import { parseSsoErrorCode, ssoErrorMessage } from "@/lib/auth/sso/messages";

export const dynamic = "force-dynamic";

/** Where an app's SSO sign-in (or link) ends up in the browser: the app
 * itself finds out by polling, so this only says to go back to it. */
export default async function SsoDonePage({ searchParams }: { searchParams: Promise<{ result?: string | string[] }> }) {
  const { result } = await searchParams;
  const name = (await getSsoButton())?.name ?? "single sign-on";
  const ok = result === "signed_in" || result === "linked";
  const error = ok ? null : (parseSsoErrorCode(result) ?? "failed");

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-8">
      <h1 className="font-display text-2xl text-text-primary">
        {result === "signed_in" ? "You're signed in" : result === "linked" ? `${name} is linked` : "That didn't work"}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {ok ? "Go back to the Marquee app — it'll carry on from here. You can close this tab." : ssoErrorMessage(error!, name)}
      </p>
    </div>
  );
}
