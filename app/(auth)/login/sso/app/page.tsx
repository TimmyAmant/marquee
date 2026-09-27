import { getSsoButton } from "@/lib/auth/sso/config";
import { getAppFlow } from "@/lib/auth/sso/flows";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export const dynamic = "force-dynamic";

/**
 * What the Mac and Windows apps open in the browser for "Sign in with
 * <SSO>" (and for linking SSO from their Settings): says what's about to
 * happen, and only goes on to the identity provider when the person
 * chooses to — so a sign-in link someone else sent can't quietly sign
 * their app in as you. The Continue form posts to /api/auth/sso/app.
 */
export default async function SsoAppPage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
  const { key } = await searchParams;
  const flow = getAppFlow(typeof key === "string" ? key : null);
  const sso = await getSsoButton();
  const t = await getT();

  if (!flow || !sso) {
    return (
      <div className="rounded-2xl border border-border bg-bg-1 p-8">
        <h1 className="font-display text-2xl text-text-primary">{t("auth.linkExpiredTitle")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("auth.linkExpiredBody")}</p>
      </div>
    );
  }

  const purpose = flow.purpose;
  const linking = purpose.kind === "app_link";
  const device = purpose.kind === "app_sign_in" ? purpose.deviceName : null;
  const highlight = (chunks: React.ReactNode) => <span className="text-text-primary">{chunks}</span>;

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-8">
      <h1 className="font-display text-2xl text-text-primary">
        {linking ? t("auth.appLinkTitle", { name: sso.name }) : t("auth.appSignInTitle")}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {purpose.kind === "app_link"
          ? rich(t("auth.appLinkBody", { name: sso.name, username: purpose.username }), { user: highlight })
          : device
            ? rich(t("auth.appSignInBodyDevice", { name: sso.name, device }), { device: highlight })
            : t("auth.appSignInBody", { name: sso.name })}
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        {linking ? t("auth.appWarningLink") : t("auth.appWarningSignIn")}
      </p>
      <form method="post" action="/api/auth/sso/app" className="mt-6">
        <input type="hidden" name="key" value={key as string} />
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
        >
          {t("auth.continueWith", { name: sso.name })}
        </button>
      </form>
    </div>
  );
}
