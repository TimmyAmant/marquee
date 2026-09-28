"use client";

import { useActionState } from "react";
import { createUserAction } from "./users-actions";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";
import { useResultToast } from "@/components/settings/use-result-toast";
import { SETTINGS_INPUT, SaveBar, SettingRow, SettingsGroup } from "@/components/settings/settings-ui";

/** Settings › Members › Add a household member: a row per field, one Save. */
export function CreateUserForm() {
  const t = useT();
  const [state, formAction, isPending] = useActionState(createUserAction, undefined);
  useResultToast(state, t("common.saved"));

  return (
    <form action={formAction}>
      <SettingsGroup>
        <SettingRow label={t("settings.nameLabel")} htmlFor="new-member-name" wideControl>
          <input id="new-member-name" type="text" name="displayName" autoComplete="name" className={SETTINGS_INPUT} />
        </SettingRow>
        <SettingRow label={t("settings.usernameLabel")} htmlFor="new-member-username" wideControl>
          <input id="new-member-username" type="text" name="username" required autoComplete="username" className={SETTINGS_INPUT} />
        </SettingRow>
        <SettingRow label={t("settings.passwordLabel")} htmlFor="new-member-password" wideControl>
          <input
            id="new-member-password"
            type="password"
            name="password"
            required
            autoComplete="new-password"
            minLength={8}
            className={SETTINGS_INPUT}
          />
        </SettingRow>
        <SaveBar
          label={t("settings.createAccount")}
          pendingLabel={t("settings.creatingAccount")}
          pending={isPending}
          status={
            state?.error ? (
              <span className="text-red-400">{state.error}</span>
            ) : state?.success ? (
              <span className="text-owned">
                {rich(t("settings.accountCreated", { path: "/login" }), {
                  path: (chunks) => <span className="text-text-primary">{chunks}</span>,
                })}
              </span>
            ) : null
          }
        />
      </SettingsGroup>
    </form>
  );
}
