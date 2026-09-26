"use client";

import { useActionState, useState } from "react";
import { removeChannelAction, saveChannelAction } from "@/app/settings/integrations/channel-actions";
import type { ChannelSummaries } from "@/lib/notifications/channels";
import type { NotificationChannelKind } from "@/lib/db/schema";

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
  description,
  connected,
  fields,
  children,
  successText,
}: {
  kind: NotificationChannelKind;
  title: string;
  description: React.ReactNode;
  connected: boolean;
  fields: Field[];
  children?: React.ReactNode;
  successText: string;
}) {
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
            Connected
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
              placeholder={field.keepsSaved && isConnected ? "•••••••••••••••• (leave blank to keep)" : field.placeholder}
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
          {isPending ? "Testing…" : "Test & save"}
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
            {isRemoving ? "Removing…" : `Remove ${title.split(" ")[0]}`}
          </button>
          {removeState?.error && <p className="mt-1 text-xs text-red-400">{removeState.error}</p>}
        </form>
      )}
    </div>
  );
}

const WHAT = "whenever something is grabbed, downloaded, or a request is approved/rejected.";

export function NotificationChannelCards({ channels }: { channels: ChannelSummaries }) {
  const { telegram, pushover, email } = channels;
  return (
    <>
      <ChannelCard
        kind="telegram"
        title="Telegram notifications"
        description={`Posts to a Telegram chat, group or channel through your own bot ${WHAT}`}
        connected={telegram.connected}
        successText="Connected — check the chat for a test message."
        fields={[
          {
            name: "botToken",
            label: "Bot token",
            type: "password",
            required: true,
            keepsSaved: true,
            placeholder: "123456789:AA…",
            hint: "Message @BotFather on Telegram, send /newbot, and paste the token it gives you.",
          },
          {
            name: "chatId",
            label: "Chat ID",
            required: true,
            defaultValue: telegram.chatId ?? "",
            placeholder: "123456789, -100…, or @channelname",
            hint: "Send your bot a message (or add it to the group), then open api.telegram.org/bot<token>/getUpdates to find the chat's id.",
          },
        ]}
      />
      <ChannelCard
        kind="pushover"
        title="Pushover notifications"
        description={`Sends a push notification through Pushover ${WHAT}`}
        connected={pushover.connected}
        successText="Connected — a test notification is on its way."
        fields={[
          {
            name: "appToken",
            label: "Application token",
            type: "password",
            required: true,
            keepsSaved: true,
            hint: "Create an application at pushover.net/apps/build and copy its API token.",
          },
          {
            name: "userKey",
            label: "User or group key",
            type: "password",
            required: true,
            hint: "Your user key is at the top of your pushover.net dashboard.",
          },
        ]}
      />
      <ChannelCard
        kind="email"
        title="Email notifications"
        description={`Emails one or more addresses through your own mail server (SMTP) ${WHAT}`}
        connected={email.connected}
        successText="Connected — check the inbox for a test email."
        fields={[
          { name: "host", label: "SMTP server", required: true, defaultValue: email.host ?? "", placeholder: "smtp.gmail.com" },
          {
            name: "port",
            label: "Port",
            type: "number",
            required: true,
            defaultValue: String(email.port ?? 587),
            hint: "587 for most servers; 465 with \"Secure connection\" on.",
          },
          { name: "username", label: "Username", defaultValue: email.username ?? "", placeholder: "Leave blank if the server needs none" },
          {
            name: "password",
            label: "Password",
            type: "password",
            keepsSaved: true,
            hint: "For Gmail, an app password (myaccount.google.com/apppasswords), not your normal one.",
          },
          { name: "from", label: "From address", type: "email", required: true, defaultValue: email.from ?? "", placeholder: "marquee@example.com" },
          {
            name: "to",
            label: "Send to",
            required: true,
            defaultValue: email.to.join(", "),
            placeholder: "you@example.com, partner@example.com",
            hint: "One or more addresses, separated by commas.",
          },
        ]}
      >
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" name="secure" defaultChecked={email.secure} className="h-4 w-4 rounded border-border accent-accent" />
          Secure connection from the start (TLS, usually port 465)
        </label>
      </ChannelCard>
    </>
  );
}
