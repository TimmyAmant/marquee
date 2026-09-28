"use client";

import { useEffect, useRef, useState } from "react";
import type {
  NotificationPreferenceRow,
  PersonalNotificationChannel,
  PersonalNotificationChannels,
} from "@/lib/api/types";
import {
  addChannelAction,
  getMyChannelsAction,
  getPreferencesAction,
  pollTelegramLinkAction,
  removeChannelAction,
  resendCodeAction,
  savePreferencesAction,
  startTelegramLinkAction,
  testChannelAction,
  updateChannelAction,
  verifyChannelAction,
} from "./notification-actions";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";
import { timeAgo } from "@/lib/i18n/format";
import type { Translator } from "@/lib/i18n/translator";
import { eventLabel, isPreferenceEvent } from "@/lib/notifications/events";

// Settings › Account › Notifications, below "this device": the account's own
// channels (Telegram, Pushover, email, Discord, ntfy, a webhook) and which
// events reach the bell, device push, and each channel.

type Kind = PersonalNotificationChannel["kind"];

const KINDS: Kind[] = ["telegram", "pushover", "email", "discord", "ntfy", "webhook"];

/** Brand names stay as they are; "Email" and "Webhook" are translated. */
const BRAND_LABEL: Record<Exclude<Kind, "email" | "webhook">, string> = {
  telegram: "Telegram",
  pushover: "Pushover",
  discord: "Discord",
  ntfy: "ntfy",
};

function kindLabel(t: Translator, kind: Kind): string {
  if (kind === "email") return t("settings.channelEmail");
  if (kind === "webhook") return t("settings.channelWebhook");
  return BRAND_LABEL[kind];
}

const inputClass =
  "w-full rounded-lg border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const smallButton =
  "rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";
const primaryButton =
  "rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60";

export function channelLabel(t: Translator, channel: Pick<PersonalNotificationChannel, "kind" | "name">): string {
  return channel.name || kindLabel(t, channel.kind);
}

export function PersonalNotifications() {
  const t = useT();
  const [data, setData] = useState<PersonalNotificationChannels | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [channels, preferences] = await Promise.all([getMyChannelsAction(), getPreferencesAction()]);
    if (channels.data) setData(channels.data);
    if (preferences.data) setPrefs(preferences.data.events);
    setError(channels.error ?? preferences.error ?? null);
  }

  useEffect(() => {
    // Loaded after mount: the page itself stays fast, and it refreshes
    // after every change below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  function replace(channel: PersonalNotificationChannel) {
    setData((current) =>
      current ? { ...current, channels: current.channels.map((c) => (c.id === channel.id ? channel : c)) } : current,
    );
  }

  if (!data || !prefs) {
    return (
      <div className="mt-9 rounded-2xl border border-border bg-bg-1 p-6 text-sm text-text-muted">
        {error ?? t("common.loading")}
      </div>
    );
  }

  return (
    <>
      <h3 className="mt-9 text-base font-semibold text-text-primary">{t("settings.yourChannels")}</h3>
      <p className="mt-1 text-sm text-text-secondary">{t("settings.yourChannelsIntro")}</p>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-bg-1">
        {data.channels.length === 0 && (
          <p className="px-6 pt-5 text-sm text-text-muted">{t("settings.noChannels")}</p>
        )}
        <ul>
          {data.channels.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} onChange={replace} onRemoved={refresh} />
          ))}
        </ul>
        <AddChannel available={data.available} onAdded={refresh} />
      </div>

      <h3 className="mt-9 text-base font-semibold text-text-primary">{t("settings.whatYouHearAbout")}</h3>
      <p className="mt-1 text-sm text-text-secondary">{t("settings.whatYouHearAboutIntro")}</p>
      <PreferenceMatrix rows={prefs} channels={data.channels} onSaved={setPrefs} />
    </>
  );
}

function ChannelRow({
  channel,
  onChange,
  onRemoved,
}: {
  channel: PersonalNotificationChannel;
  onChange: (channel: PersonalNotificationChannel) => void;
  onRemoved: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [code, setCode] = useState("");

  async function run(action: () => Promise<{ channel?: PersonalNotificationChannel; error?: string }>, ok?: string) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.channel) onChange(result.channel);
    if (result.error) setMessage({ tone: "error", text: result.error });
    else if (ok) setMessage({ tone: "ok", text: ok });
  }

  async function remove() {
    setBusy(true);
    const result = await removeChannelAction(channel.id);
    setBusy(false);
    if (result.error) setMessage({ tone: "error", text: result.error });
    else onRemoved();
  }

  return (
    <li className="border-b border-border px-6 py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-text-primary">
            {channelLabel(t, channel)}
            {channel.name && <span className="text-text-muted"> · {kindLabel(t, channel.kind)}</span>}
          </p>
          <p className="truncate text-xs text-text-muted">{channel.target}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {channel.verified && (
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={channel.enabled}
                disabled={busy}
                onChange={(e) => run(() => updateChannelAction(channel.id, { enabled: e.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              {t("common.on")}
            </label>
          )}
          {channel.verified && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => run(() => testChannelAction(channel.id), t("settings.channelTestSent"))}>
              {t("settings.sendTest")}
            </button>
          )}
          <button
            type="button"
            className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
            disabled={busy}
            onClick={remove}
          >
            {t("common.remove")}
          </button>
        </div>
      </div>

      {!channel.verified && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => verifyChannelAction(channel.id, code), t("settings.channelConfirmed"));
          }}
        >
          <span className="text-xs text-text-secondary">{channel.kind === "telegram" ? t("settings.codeSentTelegram") : t("settings.codeSentEmail", { address: channel.target })}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-label={t("settings.confirmationCode")}
            className={`${inputClass} w-28`}
          />
          <button type="submit" className={smallButton} disabled={busy || code.trim().length < 6}>
            {t("common.confirm")}
          </button>
          <button type="button" className="text-xs text-text-secondary hover:text-accent" disabled={busy} onClick={() => run(() => resendCodeAction(channel.id), t("settings.newCodeSent"))}>
            {t("settings.sendNewCode")}
          </button>
        </form>
      )}

      {channel.lastError ? (
        <p className="mt-2 text-xs text-red-400">
          {channel.lastErrorAt
            ? t("settings.lastTryFailedAgo", { when: timeAgo(t, channel.lastErrorAt), error: channel.lastError })
            : t("settings.lastTryFailed", { error: channel.lastError })}
        </p>
      ) : channel.lastSuccessAt ? (
        <p className="mt-2 text-xs text-text-muted">
          {t("settings.lastDelivered", { when: timeAgo(t, channel.lastSuccessAt) })}
        </p>
      ) : null}
      {message && (
        <p className={`mt-2 text-xs ${message.tone === "ok" ? "text-owned" : "text-red-400"}`}>{message.text}</p>
      )}
    </li>
  );
}

type Field = { name: string; label: string; placeholder?: string; hint?: string; type?: string };

const WEBHOOK_SHAPE = "{ event, preference, title, message, mediaType, tmdbId }";

function fieldsFor(
  t: Translator,
  kind: Kind,
  available: PersonalNotificationChannels["available"],
  ntfyMode: "household" | "url",
): Field[] {
  switch (kind) {
    case "telegram":
      return [
        {
          name: "chatId",
          label: t("settings.telegramChatId"),
          placeholder: "123456789",
          hint: available.telegram.botUsername
            ? t("settings.telegramChatIdHintBot", { bot: `@${available.telegram.botUsername}` })
            : t("settings.telegramChatIdHint"),
        },
      ];
    case "pushover":
      return [{ name: "userKey", label: t("settings.pushoverUserKey"), hint: t("settings.pushoverUserKeyHint"), type: "password" }];
    case "email":
      return [
        {
          name: "address",
          label: t("settings.emailAddress"),
          placeholder: t("settings.emailPlaceholder"),
          type: "email",
          hint: t("settings.emailHint"),
        },
      ];
    case "discord":
      return [
        {
          name: "webhookUrl",
          label: t("settings.discordWebhookUrl"),
          placeholder: "https://discord.com/api/webhooks/…",
          type: "password",
          hint: t("settings.discordWebhookHint"),
        },
      ];
    case "ntfy":
      return ntfyMode === "household"
        ? [
            {
              name: "topic",
              label: t("settings.ntfyTopic"),
              placeholder: t("settings.ntfyTopicPlaceholder"),
              hint: t("settings.ntfyTopicHint", { server: available.ntfy.householdServer ?? "" }),
            },
          ]
        : [{ name: "url", label: t("settings.ntfyTopicUrl"), placeholder: t("settings.ntfyTopicUrlPlaceholder"), type: "password" }];
    case "webhook":
      return [
        {
          name: "url",
          label: t("settings.webhookUrl"),
          placeholder: "https://example.com/hooks/marquee",
          type: "password",
          // The JSON's shape is code, not words: never translated.
          hint: available.webhook.homeNetwork
            ? t("settings.webhookHint", { shape: WEBHOOK_SHAPE })
            : t("settings.webhookHintInternet", { shape: WEBHOOK_SHAPE }),
        },
      ];
  }
}

function AddChannel({ available, onAdded }: { available: PersonalNotificationChannels["available"]; onAdded: () => void }) {
  const t = useT();
  const kinds = KINDS.filter((kind) => available[kind].available);
  const [kind, setKind] = useState<Kind>(kinds[0] ?? "discord");
  const [ntfyMode, setNtfyMode] = useState<"household" | "url">(available.ntfy.householdServer ? "household" : "url");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const polling = useRef(0);

  useEffect(() => () => void polling.current++, []);

  const missing = KINDS.filter((k) => !available[k].available);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const config: Record<string, string> = {};
    for (const field of fieldsFor(t, kind, available, ntfyMode)) config[field.name] = String(form.get(field.name) ?? "");
    const result = await addChannelAction({ kind, name: String(form.get("name") ?? ""), config });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setNotice(
      kind === "email"
        ? t("settings.checkInbox")
        : kind === "telegram"
          ? t("settings.checkTelegram")
          : t("settings.channelAdded"),
    );
    onAdded();
  }

  async function connectTelegram() {
    setError(null);
    const started = await startTelegramLinkAction();
    if (!started.code || !started.url) {
      setError(started.error ?? t("settings.telegramStartFailed"));
      return;
    }
    setLink({ code: started.code, url: started.url });
    window.open(started.url, "_blank", "noopener");
    const run = ++polling.current;
    for (let i = 0; i < 120 && run === polling.current; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (run !== polling.current) return;
      const result = await pollTelegramLinkAction(started.code);
      if (result.pending) continue;
      setLink(null);
      if (result.error) setError(result.error);
      else {
        setNotice(t("settings.telegramConnected"));
        onAdded();
      }
      return;
    }
    if (run === polling.current) setLink(null);
  }

  if (kinds.length === 0) return null;
  // Email and a typed-in Telegram chat are confirmed with a code first.
  const sendsCode = kind === "email" || kind === "telegram";
  const fields = fieldsFor(t, kind, available, ntfyMode);

  return (
    <div className="px-6 py-5 text-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{t("settings.addChannel")}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === kind}
            onClick={() => {
              setKind(k);
              setError(null);
              setNotice(null);
            }}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              k === kind ? "bg-accent text-bg-0" : "border border-border-strong text-text-secondary hover:text-accent"
            }`}
          >
            {kindLabel(t, k)}
          </button>
        ))}
      </div>

      {kind === "telegram" && available.telegram.botUsername && (
        <div className="mt-4 rounded-xl border border-border bg-bg-0 p-4">
          <p className="text-text-secondary">
            {rich(t("settings.telegramQuickest", { bot: `@${available.telegram.botUsername}` }), {
              b: (chunks) => <span className="text-text-primary">{chunks}</span>,
            })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={smallButton} onClick={connectTelegram} disabled={Boolean(link)}>
              {link ? t("settings.waitingForStart") : t("settings.connectTelegram")}
            </button>
            {link && (
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">
                {t("settings.openTelegramAgain")}
              </a>
            )}
          </div>
        </div>
      )}

      {kind === "ntfy" && available.ntfy.householdServer && (
        <div className="mt-4 flex gap-4 text-xs text-text-secondary">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={ntfyMode === "household"} onChange={() => setNtfyMode("household")} className="accent-accent" />
            {t("settings.ntfyHouseholdTopic")}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={ntfyMode === "url"} onChange={() => setNtfyMode("url")} className="accent-accent" />
            {t("settings.ntfyFullUrl")}
          </label>
        </div>
      )}

      <form ref={formRef} action={submit} className="mt-4 flex flex-col gap-3" key={`${kind}-${ntfyMode}`}>
        {fields.map((field) => (
          <label key={field.name} className="flex flex-col gap-1.5 text-text-secondary">
            {field.label}
            <input name={field.name} type={field.type ?? "text"} required autoComplete="off" placeholder={field.placeholder} className={inputClass} />
            {field.hint && <span className="text-xs text-text-muted">{field.hint}</span>}
          </label>
        ))}
        <label className="flex flex-col gap-1.5 text-text-secondary">
          {t("settings.nameLabel")} <span className="-mt-1 text-xs text-text-muted">{t("settings.channelNameHint")}</span>
          <input name="name" maxLength={60} autoComplete="off" className={inputClass} />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {notice && <p className="text-xs text-owned">{notice}</p>}
        <button type="submit" disabled={busy} className={`${primaryButton} self-start`}>
          {busy
            ? sendsCode
              ? t("settings.sendingCode")
              : t("settings.testing")
            : sendsCode
              ? t("settings.sendCode")
              : t("settings.testAndAdd")}
        </button>
      </form>
      {missing.length > 0 && (
        <p className="mt-4 text-xs text-text-muted">
          {t("settings.channelsNotSetUp", {
            channels: new Intl.ListFormat(t.tag, { type: "conjunction" }).format(missing.map((k) => kindLabel(t, k))),
            count: missing.length,
          })}
        </p>
      )}
    </div>
  );
}

function PreferenceMatrix({
  rows,
  channels,
  onSaved,
}: {
  rows: NotificationPreferenceRow[];
  channels: PersonalNotificationChannel[];
  onSaved: (rows: NotificationPreferenceRow[]) => void;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const usable = channels.filter((c) => c.verified);

  async function toggle(event: string, change: { inApp?: boolean; push?: boolean; channels?: Record<string, boolean> }) {
    setSaving(true);
    setError(null);
    // Straight away on screen; put right from the answer.
    onSaved(
      rows.map((row) =>
        row.event === event
          ? { ...row, ...("inApp" in change ? { inApp: change.inApp! } : {}), ...("push" in change ? { push: change.push! } : {}), channels: { ...row.channels, ...(change.channels ?? {}) } }
          : row,
      ),
    );
    const result = await savePreferencesAction([{ event, ...change }]);
    setSaving(false);
    if (result.data) onSaved(result.data.events);
    if (result.error) setError(result.error);
  }

  const header = "px-3 py-2 text-center text-xs font-medium text-text-muted";
  const cell = "px-3 py-2 text-center";
  const everyone = rows.filter((r) => !r.reviewerOnly);
  const reviewer = rows.filter((r) => r.reviewerOnly);

  function renderRows(list: NotificationPreferenceRow[]) {
    return list.map((row) => {
      const label = isPreferenceEvent(row.event) ? eventLabel(t, row.event) : row.label;
      return (
      <tr key={row.event} className="border-t border-border">
        <th scope="row" className="px-4 py-2 text-left font-normal text-text-primary">{label}</th>
        <td className={cell}>
          <input type="checkbox" aria-label={t("settings.eventWhere", { event: label, where: t("settings.bell") })} checked={row.inApp} onChange={(e) => toggle(row.event, { inApp: e.target.checked })} className="h-4 w-4 accent-accent" />
        </td>
        <td className={cell}>
          <input type="checkbox" aria-label={t("settings.eventWhere", { event: label, where: t("settings.devices") })} checked={row.push} onChange={(e) => toggle(row.event, { push: e.target.checked })} className="h-4 w-4 accent-accent" />
        </td>
        {usable.map((channel) => (
          <td key={channel.id} className={cell}>
            <input
              type="checkbox"
              aria-label={t("settings.eventWhere", { event: label, where: channelLabel(t, channel) })}
              checked={row.channels[channel.id] ?? false}
              onChange={(e) => toggle(row.event, { channels: { [channel.id]: e.target.checked } })}
              className="h-4 w-4 accent-accent"
            />
          </td>
        ))}
      </tr>
      );
    });
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-bg-1 text-sm">
      <table className="w-full min-w-[26rem]">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">{t("settings.event")}</th>
            <th className={header}>{t("settings.bell")}</th>
            <th className={header}>{t("settings.devices")}</th>
            {usable.map((channel) => (
              <th key={channel.id} className={header}>
                {channelLabel(t, channel)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderRows(everyone)}
          {reviewer.length > 0 && (
            <tr className="border-t border-border">
              <th colSpan={3 + usable.length} className="px-4 pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                {t("settings.forReviewers")}
              </th>
            </tr>
          )}
          {renderRows(reviewer)}
        </tbody>
      </table>
      {(error || saving) && (
        <p className={`px-4 pb-3 text-xs ${error ? "text-red-400" : "text-text-muted"}`}>{error ?? t("common.saving")}</p>
      )}
    </div>
  );
}
