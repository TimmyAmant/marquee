"use client";

import { useActionState, useState } from "react";
import { removeChannelAction, saveChannelAction } from "@/app/settings/integrations/channel-actions";
import type { ChannelSummaries } from "@/lib/notifications/channels";
import type { NotificationChannelKind } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent";

type Field = {
  name: string;
  label: string;
  type?: "text" | "password" | "number" | "email";
  placeholder?: string;
  defaultValue?: string;
  /** A secret already saved: left blank, the saved one is kept. */
  keepsSaved?: boolean;
  hint?: string;
  required?: boolean;
};

function ChannelCard({
  kind,
  title,
  shortName,
  description,
  connected,
  fields,
  children,
  successText,
}: {
  kind: NotificationChannelKind;
  title: string;
  /** "Telegram", "Pushover", "Email" — for "Remove …". */
  shortName: string;
  description: React.ReactNode;
  connected: boolean;
  fields: Field[];
  children?: React.ReactNode;
  successText: string;
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(saveChannelAction, undefined);
  const [removeState, removeAction, isRemoving] = useActionState(removeChannelAction, undefined);
  // The newer of the two outcomes wins: a save after a remove is connected.
  const [lastAction, setLastAction] = useState<"save" | "remove" | null>(null);
  const isConnected =
    lastAction === "save" && state?.success ? true : lastAction === "remove" && removeState?.removed ? false : connected;
  const typed = state?.error ? state.values : undefined;

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-text-primary">{title}</h3>
          <p className="mt-1 text-xs text-text-muted">{description}</p>
        </div>
        {isConnected && (
          <span className="shrink-0 rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            {t("integrations.connected")}
          </span>
        )}
      </div>

      <form action={formAction} onSubmit={() => setLastAction("save")} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="kind" value={kind} />
        {fields.map((field) => (
          <label key={field.name} className="flex flex-col gap-1.5 text-sm text-text-secondary">
            {field.label}
            <input
              type={field.type ?? "text"}
              name={field.name}
              required={field.required && !(field.keepsSaved && isConnected)}
              defaultValue={typed?.[field.name] ?? field.defaultValue}
              autoComplete="off"
              placeholder={field.keepsSaved && isConnected ? t("integrations.leaveBlankToKeep") : field.placeholder}
              className={inputClass}
            />
            {field.hint && <span className="text-xs text-text-muted">{field.hint}</span>}
          </label>
        ))}
        {children}

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state?.success && <p className="text-sm text-owned">{successText}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? t("integrations.testing") : t("integrations.testAndSave")}
        </button>
      </form>

      {isConnected && (
        <form action={removeAction} onSubmit={() => setLastAction("remove")} className="mt-3">
          <input type="hidden" name="kind" value={kind} />
          <button
            type="submit"
            disabled={isRemoving}
            className="text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
          >
            {isRemoving ? t("integrations.removing") : t("integrations.removeChannel", { name: shortName })}
          </button>
          {removeState?.error && <p className="mt-1 text-xs text-red-400">{removeState.error}</p>}
        </form>
      )}
    </div>
  );
}

export function NotificationChannelCards({ channels }: { channels: ChannelSummaries }) {
  const t = useT();
  const { telegram, pushover, email } = channels;
  return (
    <>
      <ChannelCard
        kind="telegram"
        title={t("integrations.channelTelegramTitle")}
        shortName="Telegram"
        description={t("integrations.channelTelegramIntro")}
        connected={telegram.connected}
        successText={t("integrations.channelTelegramSuccess")}
        fields={[
          {
            name: "botToken",
            label: t("integrations.botToken"),
            type: "password",
            required: true,
            keepsSaved: true,
            placeholder: "123456789:AA…",
            hint: t("integrations.botTokenHint"),
          },
          {
            name: "chatId",
            label: t("integrations.chatId"),
            required: true,
            defaultValue: telegram.chatId ?? "",
            placeholder: t("integrations.chatIdPlaceholder"),
            hint: t("integrations.chatIdHint", { url: "api.telegram.org/bot<token>/getUpdates" }),
          },
        ]}
      />
      <ChannelCard
        kind="pushover"
        title={t("integrations.channelPushoverTitle")}
        shortName="Pushover"
        description={t("integrations.channelPushoverIntro")}
        connected={pushover.connected}
        successText={t("integrations.channelPushoverSuccess")}
        fields={[
          {
            name: "appToken",
            label: t("integrations.appToken"),
            type: "password",
            required: true,
            keepsSaved: true,
            hint: t("integrations.appTokenHint"),
          },
          {
            name: "userKey",
            label: t("integrations.userKey"),
            type: "password",
            required: true,
            hint: t("integrations.userKeyHint"),
          },
        ]}
      />
      <ChannelCard
        kind="email"
        title={t("integrations.channelEmailTitle")}
        shortName={t("integrations.channelEmailShort")}
        description={t("integrations.channelEmailIntro")}
        connected={email.connected}
        successText={t("integrations.channelEmailSuccess")}
        fields={[
          { name: "host", label: t("integrations.smtpServer"), required: true, defaultValue: email.host ?? "", placeholder: "smtp.gmail.com" },
          {
            name: "port",
            label: t("integrations.port"),
            type: "number",
            required: true,
            defaultValue: String(email.port ?? 587),
            hint: t("integrations.portHint"),
          },
          {
            name: "username",
            label: t("integrations.username"),
            defaultValue: email.username ?? "",
            placeholder: t("integrations.usernamePlaceholder"),
          },
          {
            name: "password",
            label: t("integrations.password"),
            type: "password",
            keepsSaved: true,
            hint: t("integrations.passwordHint"),
          },
          { name: "from", label: t("integrations.fromAddress"), type: "email", required: true, defaultValue: email.from ?? "", placeholder: "marquee@example.com" },
          {
            name: "to",
            label: t("integrations.sendTo"),
            required: true,
            defaultValue: email.to.join(", "),
            placeholder: "you@example.com, partner@example.com",
            hint: t("integrations.sendToHint"),
          },
        ]}
      >
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" name="secure" defaultChecked={email.secure} className="h-4 w-4 rounded border-border accent-accent" />
          {t("integrations.secureConnection")}
        </label>
      </ChannelCard>
    </>
  );
}
