"use client";

import { useActionState, useState } from "react";
import {
  removeSsoSettingsAction,
  saveSsoSettingsAction,
  testSsoIssuerAction,
} from "@/app/settings/integrations/sso-actions";
import type { SsoSettingsView, SsoTestResult } from "@/lib/auth/sso/config";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent";
const CALLBACK_PATH = "/api/auth/sso/callback";

function callbackFor(publicUrl: string): string {
  try {
    return `${new URL(publicUrl).origin}${CALLBACK_PATH}`;
  } catch {
    return `https://your-marquee-address${CALLBACK_PATH}`;
  }
}

function Toggle({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3 text-sm text-text-secondary">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-accent" />
      <span>
        <span className="text-text-primary">{label}</span>
        <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Settings → Integrations' "Single sign-on": any OpenID Connect provider
 * (Authentik, Authelia, Pocket ID, Keycloak, Google…). The client secret is
 * write-only — the page only knows whether one is saved.
 */
export function SsoSettingsCard({ initial, defaultPublicUrl }: { initial: SsoSettingsView | null; defaultPublicUrl: string }) {
  const [state, formAction, isPending] = useActionState(saveSsoSettingsAction, undefined);
  const [removed, setRemoved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const saved = removed ? null : (state?.settings ?? initial);
  const [publicUrl, setPublicUrl] = useState(initial?.publicUrl ?? defaultPublicUrl);
  const [issuer, setIssuer] = useState(initial?.issuer ?? "");
  const [test, setTest] = useState<{ result?: SsoTestResult; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const callbackUrl = callbackFor(publicUrl);

  async function runTest() {
    setTesting(true);
    setTest(null);
    setTest(await testSsoIssuerAction(issuer));
    setTesting(false);
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-text-primary">Single sign-on</h3>
          <p className="mt-1 text-xs text-text-muted">
            Adds “Sign in with …” for your own identity provider — Authentik, Authelia, Pocket ID, Keycloak,
            Google, or anything else that speaks OpenID Connect — on the website and the Mac and Windows apps.
          </p>
        </div>
        {saved && (
          <span className="shrink-0 rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            On
          </span>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Button name
          <input name="name" required maxLength={40} defaultValue={saved?.name ?? ""} placeholder="Authentik" className={inputClass} />
          <span className="text-xs text-text-muted">The sign-in button says “Sign in with {"<name>"}”.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Marquee&apos;s address
          <input
            name="publicUrl"
            required
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://marquee.example.com"
            className={inputClass}
          />
          <span className="text-xs text-text-muted">The address people use to reach Marquee from outside.</span>
        </label>

        <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Redirect URI — add this to the provider exactly
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-xs text-text-primary">
              {callbackUrl}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(callbackUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  // Clipboard blocked: the text is selectable.
                }
              }}
              className="shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary hover:border-accent hover:text-accent"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Issuer URL
          <div className="flex gap-2">
            <input
              name="issuer"
              required
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="https://auth.example.com/application/o/marquee/"
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !issuer.trim()}
              className="shrink-0 rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {testing ? "Testing…" : "Test"}
            </button>
          </div>
          <span className="text-xs text-text-muted">
            The provider&apos;s issuer, or its …/.well-known/openid-configuration address.
          </span>
        </label>
        {test?.error && <p className="text-sm text-red-400">{test.error}</p>}
        {test?.result && (
          <div className="rounded-lg border border-owned/30 bg-owned-bg px-3.5 py-2.5 text-xs text-owned">
            Found {test.result.issuer}
            {test.result.warnings.map((w) => (
              <p key={w} className="mt-1 text-amber-400">
                {w}
              </p>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Client ID
          <input name="clientId" required defaultValue={saved?.clientId ?? ""} className={inputClass} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Client secret
          <input
            name="clientSecret"
            type="password"
            autoComplete="new-password"
            placeholder={saved?.hasClientSecret ? "•••••••••••••••• (enter to replace)" : "Leave empty for a public client"}
            className={inputClass}
          />
        </label>
        {saved?.hasClientSecret && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" name="clearClientSecret" className="h-3.5 w-3.5 accent-accent" />
            Remove the saved secret (a public client)
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Scopes
          <input name="scopes" defaultValue={saved?.scopes ?? "openid profile email"} className={inputClass} />
          <span className="text-xs text-text-muted">Add “groups” for Authelia and Pocket ID if you use groups below.</span>
        </label>

        <div className="mt-2 flex flex-col gap-3">
          <Toggle
            name="allowSignup"
            defaultChecked={saved?.allowSignup ?? false}
            label="New accounts from single sign-on"
            hint="Anyone your provider lets in gets a member account on first sign-in. Off: only accounts that linked it can use it."
          />
          <Toggle
            name="matchEmail"
            defaultChecked={saved?.matchEmail ?? false}
            label="Match existing accounts by verified email"
            hint="First sign-in links an account whose username is the person's email — only when the provider says the email is verified, and never the admin account."
          />
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Required group (optional)
          <input name="requiredGroup" defaultValue={saved?.requiredGroup ?? ""} placeholder="marquee-users" className={inputClass} />
          <span className="text-xs text-text-muted">Only people in this group can sign in with it.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Trusted group (optional)
          <input name="trustedGroup" defaultValue={saved?.trustedGroup ?? ""} placeholder="marquee-trusted" className={inputClass} />
          <span className="text-xs text-text-muted">
            Members in this group become Trusted when they sign in. Nobody is ever made an admin this way.
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Groups claim
          <input name="groupsClaim" defaultValue={saved?.groupsClaim ?? "groups"} className={inputClass} />
        </label>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state?.success && !removed && <p className="text-sm text-owned">Saved. The sign-in button is live.</p>}

        <button
          type="submit"
          disabled={isPending}
          onClick={() => setRemoved(false)}
          className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Checking…" : "Test & save"}
        </button>
      </form>

      {saved && (
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            const result = await removeSsoSettingsAction();
            setRemoving(false);
            if (result.success) setRemoved(true);
          }}
          className="mt-3 text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
        >
          {removing ? "Turning off…" : "Turn off single sign-on"}
        </button>
      )}
    </div>
  );
}
