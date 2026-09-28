"use client";

import { useState } from "react";
import { removeChannelAction, saveChannelAction } from "@/app/settings/integrations/channel-actions";
import type { ChannelSummaries } from "@/lib/notifications/channels";
import type { NotificationChannelKind } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { ConnectionForm, type ConnectionField } from "@/components/settings/connection-form";
import { SettingRow } from "@/components/settings/settings-ui";

type Field = ConnectionField & { hint?: string };

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
  return (
    <ConnectionForm
      title={title}
      description={description}
      connected={connected}
      fields={fields.map(({ hint, ...field }) => ({ ...field, help: field.help ?? hint }))}
      action={saveChannelAction}
      remove={removeChannelAction}
      removeLabel={t("integrations.removeChannel", { name: shortName })}
      savedText={successText}
      testedText={t("settings.testSent")}
      hidden={{ kind }}
    >
      {children}
    </ConnectionForm>
  );
}

/** Email's "Secure connection", a row of its own. */
function SecureRow({ initial }: { initial: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial);
  return (
    <SettingRow label={t("integrations.secureConnection")} htmlFor="channel-email-secure">
      <input
        id="channel-email-secure"
        type="checkbox"
        name="secure"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-accent"
      />
    </SettingRow>
  );
}

/** The household's Telegram, Pushover and email; `only` picks one
 * (Settings › Notifications has a tab for each). */
export function NotificationChannelCards({
  channels,
  only,
}: {
  channels: ChannelSummaries;
  only?: NotificationChannelKind;
}) {
  const t = useT();
  const { telegram, pushover, email } = channels;
  const shows = (kind: NotificationChannelKind) => !only || only === kind;
  return (
    <>
      {shows("telegram") && <ChannelCard
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
      />}
      {shows("pushover") && <ChannelCard
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
      />}
      {shows("email") && <ChannelCard
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
        <SecureRow initial={email.secure} />
      </ChannelCard>}
      {shows("gotify") && (
        <ChannelCard
          kind="gotify"
          title={t("integrations.channelGotifyTitle")}
          shortName="Gotify"
          description={t("integrations.channelGotifyIntro")}
          connected={channels.gotify.connected}
          successText={t("integrations.channelGotifySuccess")}
          fields={[
            {
              name: "url",
              label: t("integrations.gotifyServer"),
              type: "url",
              required: true,
              defaultValue: channels.gotify.url ?? "",
              placeholder: "https://gotify.example.com",
            },
            {
              name: "appToken",
              label: t("integrations.appToken"),
              type: "password",
              required: true,
              keepsSaved: true,
              hint: t("integrations.gotifyTokenHint"),
            },
            {
              name: "priority",
              label: t("integrations.gotifyPriority"),
              type: "number",
              defaultValue: String(channels.gotify.priority ?? 5),
              hint: t("integrations.gotifyPriorityHint"),
            },
          ]}
        />
      )}
      {shows("slack") && (
        <ChannelCard
          kind="slack"
          title={t("integrations.channelSlackTitle")}
          shortName="Slack"
          description={t("integrations.channelSlackIntro")}
          connected={channels.slack.connected}
          successText={t("integrations.channelSlackSuccess")}
          fields={[
            {
              name: "webhookUrl",
              label: t("integrations.slackWebhookUrl"),
              type: "password",
              required: true,
              keepsSaved: true,
              placeholder: "https://hooks.slack.com/services/…",
              hint: t("integrations.slackWebhookHint"),
            },
          ]}
        />
      )}
      {shows("pushbullet") && (
        <ChannelCard
          kind="pushbullet"
          title={t("integrations.channelPushbulletTitle")}
          shortName="Pushbullet"
          description={t("integrations.channelPushbulletIntro")}
          connected={channels.pushbullet.connected}
          successText={t("integrations.channelPushbulletSuccess")}
          fields={[
            {
              name: "accessToken",
              label: t("integrations.pushbulletToken"),
              type: "password",
              required: true,
              keepsSaved: true,
              hint: t("integrations.pushbulletTokenHint"),
            },
            {
              name: "channelTag",
              label: t("integrations.pushbulletChannel"),
              defaultValue: channels.pushbullet.channelTag ?? "",
              hint: t("integrations.pushbulletChannelHint"),
            },
          ]}
        />
      )}
    </>
  );
}
