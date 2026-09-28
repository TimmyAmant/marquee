"use client";

import { useActionState, useState } from "react";
import {
  removeSsoSettingsAction,
  saveSsoSettingsAction,
  testSsoIssuerAction,
} from "@/app/settings/integrations/sso-actions";
import type { SsoSettingsView, SsoTestResult } from "@/lib/auth/sso/config";
import { useT } from "@/lib/i18n/client";
import { useResultToast } from "@/components/settings/use-result-toast";
import { showToast } from "@/components/toast";
import {
  SETTINGS_INPUT,
  SETTINGS_SECONDARY_BUTTON,
  SaveBar,
  SettingRow,
  SettingsGroup,
  SettingsGroupHeader,
  StatusPill,
} from "@/components/settings/settings-ui";

const CALLBACK_PATH = "/api/auth/sso/callback";

function callbackFor(publicUrl: string): string {
  try {
    return `${new URL(publicUrl).origin}${CALLBACK_PATH}`;
  } catch {
    return `https://your-marquee-address${CALLBACK_PATH}`;
  }
}

/** A text field on its own row. */
function FieldRow({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SettingRow label={label} help={help} htmlFor={id} wideControl>
      {children}
    </SettingRow>
  );
}

/**
 * Settings › Members' "Single sign-on": any OpenID Connect provider
 * (Authentik, Authelia, Pocket ID, Keycloak, Google…), a row per setting and
 * one Save (which checks the provider first). The client secret is
 * write-only — the page only knows whether one is saved.
 */
export function SsoSettingsCard({ initial, defaultPublicUrl }: { initial: SsoSettingsView | null; defaultPublicUrl: string }) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(saveSsoSettingsAction, undefined);
  useResultToast(state, t("integrations.ssoSaved"));
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
    const result = await testSsoIssuerAction(issuer);
    setTest(result);
    setTesting(false);
    if (result.error) showToast(result.error, "error");
    else if (result.result) showToast(t("settings.testPassed"));
  }

  async function turnOff() {
    setRemoving(true);
    const result = await removeSsoSettingsAction();
    setRemoving(false);
    if (result.success) {
      setRemoved(true);
      showToast(t("settings.removedToast"));
    }
  }

  return (
    <form action={formAction}>
      <SettingsGroup>
        <SettingsGroupHeader
          title={t("integrations.ssoTitle")}
          description={t("integrations.ssoIntro")}
          status={saved ? <StatusPill>{t("common.on")}</StatusPill> : undefined}
        />

        <FieldRow id="sso-name" label={t("integrations.ssoButtonName")} help={t("integrations.ssoButtonNameHint")}>
          {/* i18n-ignore */}
          <input id="sso-name" name="name" required maxLength={40} defaultValue={saved?.name ?? ""} placeholder="Authentik" className={SETTINGS_INPUT} />
        </FieldRow>

        <FieldRow id="sso-public-url" label={t("integrations.ssoPublicUrl")} help={t("integrations.ssoPublicUrlHint")}>
          <input
            id="sso-public-url"
            name="publicUrl"
            required
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://marquee.example.com" // i18n-ignore
            className={SETTINGS_INPUT}
          />
        </FieldRow>

        <SettingRow label={t("integrations.ssoRedirectUri")} wideControl>
          <div className="flex w-full items-center gap-2">
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
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </SettingRow>

        <FieldRow
          id="sso-issuer"
          label={t("integrations.ssoIssuerUrl")}
          help={
            <>
              {t("integrations.ssoIssuerHint")}
              {test?.error && <span className="mt-1 block text-red-400">{test.error}</span>}
              {test?.result && (
                <span className="mt-1 block text-owned">
                  {t("integrations.ssoFound", { issuer: test.result.issuer })}
                  {test.result.warnings.map((w) => (
                    <span key={w} className="mt-1 block text-amber-400">
                      {w}
                    </span>
                  ))}
                </span>
              )}
            </>
          }
        >
          <input
            id="sso-issuer"
            name="issuer"
            required
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="https://auth.example.com/application/o/marquee/" // i18n-ignore
            className={SETTINGS_INPUT}
          />
        </FieldRow>

        <FieldRow id="sso-client-id" label={t("integrations.clientId")}>
          <input id="sso-client-id" name="clientId" required defaultValue={saved?.clientId ?? ""} className={SETTINGS_INPUT} autoComplete="off" />
        </FieldRow>
        <FieldRow
          id="sso-client-secret"
          label={t("integrations.ssoClientSecret")}
          help={
            saved?.hasClientSecret ? (
              <label className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                <input type="checkbox" name="clearClientSecret" className="h-3.5 w-3.5 accent-accent" />
                {t("integrations.ssoRemoveSecret")}
              </label>
            ) : undefined
          }
        >
          <input
            id="sso-client-secret"
            name="clientSecret"
            type="password"
            autoComplete="new-password"
            placeholder={saved?.hasClientSecret ? t("integrations.enterToReplace") : t("integrations.ssoPublicClient")}
            className={SETTINGS_INPUT}
          />
        </FieldRow>
        <FieldRow id="sso-scopes" label={t("integrations.ssoScopes")} help={t("integrations.ssoScopesHint")}>
          <input id="sso-scopes" name="scopes" defaultValue={saved?.scopes ?? "openid profile email"} className={SETTINGS_INPUT} />
        </FieldRow>

        <SettingRow label={t("integrations.ssoAllowSignup")} help={t("integrations.ssoAllowSignupHint")} htmlFor="sso-allow-signup">
          <input id="sso-allow-signup" type="checkbox" name="allowSignup" defaultChecked={saved?.allowSignup ?? false} className="h-4 w-4 accent-accent" />
        </SettingRow>
        <SettingRow label={t("integrations.ssoMatchEmail")} help={t("integrations.ssoMatchEmailHint")} htmlFor="sso-match-email">
          <input id="sso-match-email" type="checkbox" name="matchEmail" defaultChecked={saved?.matchEmail ?? false} className="h-4 w-4 accent-accent" />
        </SettingRow>

        <FieldRow id="sso-required-group" label={t("integrations.ssoRequiredGroup")} help={t("integrations.ssoRequiredGroupHint")}>
          {/* i18n-ignore */}
          <input id="sso-required-group" name="requiredGroup" defaultValue={saved?.requiredGroup ?? ""} placeholder="marquee-users" className={SETTINGS_INPUT} />
        </FieldRow>
        <FieldRow id="sso-trusted-group" label={t("integrations.ssoTrustedGroup")} help={t("integrations.ssoTrustedGroupHint")}>
          {/* i18n-ignore */}
          <input id="sso-trusted-group" name="trustedGroup" defaultValue={saved?.trustedGroup ?? ""} placeholder="marquee-trusted" className={SETTINGS_INPUT} />
        </FieldRow>
        <FieldRow id="sso-groups-claim" label={t("integrations.ssoGroupsClaim")}>
          <input id="sso-groups-claim" name="groupsClaim" defaultValue={saved?.groupsClaim ?? "groups"} className={SETTINGS_INPUT} />
        </FieldRow>

        <SaveBar
          label={t("common.save")}
          pendingLabel={t("integrations.checking")}
          pending={isPending}
          onPress={() => setRemoved(false)}
          status={
            state?.error ? (
              <span className="text-red-400">{state.error}</span>
            ) : state?.success && !removed ? (
              <span className="text-owned">{t("integrations.ssoSaved")}</span>
            ) : null
          }
          secondary={
            <>
              {saved && (
                <button
                  type="button"
                  disabled={removing}
                  onClick={turnOff}
                  className="text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
                >
                  {removing ? t("integrations.ssoTurningOff") : t("integrations.ssoTurnOff")}
                </button>
              )}
              <button type="button" onClick={runTest} disabled={testing || !issuer.trim()} className={SETTINGS_SECONDARY_BUTTON}>
                {testing ? t("integrations.testing") : t("common.test")}
              </button>
            </>
          }
        />
      </SettingsGroup>
    </form>
  );
}
