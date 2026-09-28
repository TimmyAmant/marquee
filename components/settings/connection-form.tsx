"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
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

/** What a connection's server action answers: saved, tested (checked
 * without saving), removed, or why not. `values` is what was typed,
 * handed back by the channel forms. */
export type ConnectionState =
  | { error?: string; success?: boolean; tested?: boolean; removed?: boolean; values?: Record<string, string> }
  | undefined;

type ConnectionAction = (prev: ConnectionState, formData: FormData) => Promise<ConnectionState>;

export type ConnectionField = {
  name: string;
  label: string;
  help?: React.ReactNode;
  type?: "text" | "password" | "url" | "number" | "email";
  placeholder?: string;
  defaultValue?: string;
  /** A secret already saved: left blank, the saved one is kept. */
  keepsSaved?: boolean;
  required?: boolean;
};

const noAction: ConnectionAction = async () => undefined;

/**
 * Settings' form for anything connected with a key or an address (TMDb,
 * Trakt, TheTVDB, OMDb, Jellyfin, each household channel): its heading
 * with "Connected", a row per field, and one Save bar — "Test" checks it
 * (and sends any test message) without saving, Save tests and then saves,
 * and "Remove …" forgets it. Each ends in a toast.
 *
 * The fields are controlled, so what was typed survives a Test (React
 * resets uncontrolled fields after every form action).
 */
export function ConnectionForm({
  title,
  description,
  badge,
  connected,
  fields,
  action,
  remove,
  removeLabel,
  savedText,
  testedText,
  hidden,
  children,
  onSaved,
  onCancel,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Shown instead of "Connected" when not connected (TMDb from the environment). */
  badge?: React.ReactNode;
  connected: boolean;
  fields: ConnectionField[];
  action: ConnectionAction;
  remove?: ConnectionAction;
  removeLabel?: string;
  savedText: string;
  testedText?: string;
  /** Extra form fields (a channel's kind). */
  hidden?: Record<string, string>;
  /** Extra rows under the fields (email's "Secure connection"). */
  children?: React.ReactNode;
  onSaved?: () => void;
  /** A Cancel beside Save (a server's form opened from its tile). */
  onCancel?: () => void;
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(action, undefined);
  const [removeState, removeAction, isRemoving] = useActionState(remove ?? noAction, undefined);
  const [intent, setIntent] = useState<"save" | "test">("save");
  const [last, setLast] = useState<"save" | "remove" | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ""])),
  );

  const isConnected =
    last === "save" && state?.success
      ? true
      : last === "remove" && (removeState?.removed || removeState?.success)
        ? false
        : connected;

  // One toast per answer.
  const shown = useRef<unknown>(null);
  useEffect(() => {
    if (!state || shown.current === state) return;
    shown.current = state;
    if (state.error) showToast(state.error, "error");
    else if (state.tested) showToast(testedText ?? t("settings.testPassed"));
    else if (state.success) {
      showToast(t("common.saved"));
      onSaved?.();
    }
  }, [state, testedText, t, onSaved]);
  const shownRemove = useRef<unknown>(null);
  useEffect(() => {
    if (!removeState || shownRemove.current === removeState) return;
    shownRemove.current = removeState;
    if (removeState.error) showToast(removeState.error, "error");
    else if (removeState.removed || removeState.success) showToast(t("settings.removedToast"));
  }, [removeState, t]);

  const message =
    last === "remove" && removeState?.error
      ? { tone: "error", text: removeState.error }
      : last === "save" && state?.error
        ? { tone: "error", text: state.error }
        : last === "save" && state?.tested
          ? { tone: "ok", text: testedText ?? t("settings.testPassed") }
          : last === "save" && state?.success
            ? { tone: "ok", text: savedText }
            : null;

  return (
    <form action={formAction}>
      <SettingsGroup>
        <SettingsGroupHeader
          title={title}
          description={description}
          status={isConnected ? <StatusPill>{t("integrations.connected")}</StatusPill> : badge}
        />
        {hidden && Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        {fields.map((field) => {
          const id = `connection-${String(title).toLowerCase().replace(/\W+/g, "-")}-${field.name}`;
          const keeps = field.keepsSaved && isConnected;
          return (
            <SettingRow key={field.name} label={field.label} help={field.help} htmlFor={id} wideControl>
              <input
                id={id}
                type={field.type ?? "text"}
                name={field.name}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((current) => ({ ...current, [field.name]: e.target.value }))}
                required={field.required && !keeps}
                autoComplete="off"
                placeholder={keeps ? t("integrations.leaveBlankToKeep") : field.placeholder}
                className={SETTINGS_INPUT}
              />
            </SettingRow>
          );
        })}
        {children}
        <SaveBar
          label={t("common.save")}
          pendingLabel={t("common.saving")}
          pending={isPending && intent === "save"}
          disabled={isPending || isRemoving}
          intent="save"
          onPress={() => {
            setIntent("save");
            setLast("save");
          }}
          status={
            message && (
              <span role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-red-400" : "text-owned"}>
                {message.text}
              </span>
            )
          }
          secondary={
            <>
              {onCancel && (
                <button type="button" onClick={onCancel} className={SETTINGS_SECONDARY_BUTTON}>
                  {t("common.cancel")}
                </button>
              )}
              {remove && isConnected && (
                <button
                  type="submit"
                  formAction={removeAction}
                  formNoValidate
                  disabled={isPending || isRemoving}
                  onClick={() => setLast("remove")}
                  className="text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
                >
                  {isRemoving ? t("integrations.removing") : removeLabel}
                </button>
              )}
              <button
                type="submit"
                name="intent"
                value="test"
                disabled={isPending || isRemoving}
                onClick={() => {
                  setIntent("test");
                  setLast("save");
                }}
                className={SETTINGS_SECONDARY_BUTTON}
              >
                {isPending && intent === "test" ? t("integrations.testing") : t("common.test")}
              </button>
            </>
          }
        />
      </SettingsGroup>
    </form>
  );
}
