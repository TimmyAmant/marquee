import { getSsoButton } from "@/lib/auth/sso/config";
import { getAppFlow } from "@/lib/auth/sso/flows";

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

  if (!flow || !sso) {
    return (
      <div className="rounded-2xl border border-border bg-bg-1 p-8">
        <h1 className="font-display text-2xl text-text-primary">This link has expired</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Sign-in links work once, for ten minutes. Start again from the Marquee app.
        </p>
      </div>
    );
  }

  const purpose = flow.purpose;
  const linking = purpose.kind === "app_link";
  const device = purpose.kind === "app_sign_in" ? purpose.deviceName : null;

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-8">
      <h1 className="font-display text-2xl text-text-primary">
        {linking ? `Link ${sso.name}` : "Sign in to the Marquee app"}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {linking ? (
          <>
            The Marquee app wants to link your {sso.name} account to the Marquee account{" "}
            <span className="text-text-primary">
              {purpose.kind === "app_link" ? purpose.username : ""}
            </span>
            , so it can sign in with {sso.name}.
          </>
        ) : (
          <>
            A Marquee app wants to sign in with your {sso.name} account
            {device ? (
              <>
                {" "}(it calls itself “<span className="text-text-primary">{device}</span>”)
              </>
            ) : null}
            .
          </>
        )}
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        Only continue if you started this yourself, just now, in the Marquee app. If someone sent you this
        link, don&apos;t — continuing would {linking ? "tie your account to theirs" : "sign their app in as you"}.
      </p>
      <form method="post" action="/api/auth/sso/app" className="mt-6">
        <input type="hidden" name="key" value={key as string} />
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
        >
          Continue with {sso.name}
        </button>
      </form>
    </div>
  );
}
