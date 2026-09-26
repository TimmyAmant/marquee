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

// Settings › Account › Notifications, below "this device": the account's own
// channels (Telegram, Pushover, email, Discord, ntfy, a webhook) and which
// events reach the bell, device push, and each channel.

type Kind = PersonalNotificationChannel["kind"];

const KIND_LABEL: Record<Kind, string> = {
  telegram: "Telegram",
  pushover: "Pushover",
  email: "Email",
  discord: "Discord",
  ntfy: "ntfy",
  webhook: "Webhook",
};

const inputClass =
  "w-full rounded-lg border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const smallButton =
  "rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";
const primaryButton =
  "rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function channelLabel(channel: Pick<PersonalNotificationChannel, "kind" | "name">): string {
  return channel.name || KIND_LABEL[channel.kind];
}

export function PersonalNotifications() {
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
      <div className="mt-4 max-w-2xl rounded-2xl border border-border bg-bg-1 p-6 text-sm text-text-muted">
        {error ?? "Loading…"}
      </div>
    );
  }

  return (
    <>
      <h3 className="mt-8 font-display text-lg text-text-primary">Your channels</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Get your notifications on Telegram, Pushover, email, Discord, ntfy or a webhook. Only you can see these.
      </p>
      <div className="mt-4 max-w-2xl overflow-hidden rounded-2xl border border-border bg-bg-1">
        {data.channels.length === 0 && (
          <p className="px-6 pt-5 text-sm text-text-muted">No channels yet. Add one below.</p>
        )}
        <ul>
          {data.channels.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} onChange={replace} onRemoved={refresh} />
          ))}
        </ul>
        <AddChannel available={data.available} onAdded={refresh} />
      </div>

      <h3 className="mt-8 font-display text-lg text-text-primary">What you hear about</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Choose where each kind of notification goes. The bell is the list at the top of every page; devices are the
        browsers, Macs and PCs you turned notifications on for.
      </p>
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
            {channelLabel(channel)}
            {channel.name && <span className="text-text-muted"> · {KIND_LABEL[channel.kind]}</span>}
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
              On
            </label>
          )}
          {channel.verified && (
            <button type="button" className={smallButton} disabled={busy} onClick={() => run(() => testChannelAction(channel.id), "Sent. It should arrive in a moment.")}>
              Send a test
            </button>
          )}
          <button
            type="button"
            className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
            disabled={busy}
            onClick={remove}
          >
            Remove
          </button>
        </div>
      </div>

      {!channel.verified && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => verifyChannelAction(channel.id, code), "Confirmed. Notifications will go to this address.");
          }}
        >
          <span className="text-xs text-text-secondary">{channel.kind === "telegram" ? "The bot sent a 6-digit code to your Telegram chat." : `We emailed a 6-digit code to ${channel.target}.`}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-label="Confirmation code"
            className={`${inputClass} w-28`}
          />
          <button type="submit" className={smallButton} disabled={busy || code.trim().length < 6}>
            Confirm
          </button>
          <button type="button" className="text-xs text-text-secondary hover:text-accent" disabled={busy} onClick={() => run(() => resendCodeAction(channel.id), "A new code is on its way.")}>
            Send a new code
          </button>
        </form>
      )}

      {channel.lastError ? (
        <p className="mt-2 text-xs text-red-400">
          Last try failed{channel.lastErrorAt ? ` ${timeAgo(channel.lastErrorAt)}` : ""}: {channel.lastError}
        </p>
      ) : channel.lastSuccessAt ? (
        <p className="mt-2 text-xs text-text-muted">Last delivered {timeAgo(channel.lastSuccessAt)}</p>
      ) : null}
      {message && (
        <p className={`mt-2 text-xs ${message.tone === "ok" ? "text-owned" : "text-red-400"}`}>{message.text}</p>
      )}
    </li>
  );
}

type Field = { name: string; label: string; placeholder?: string; hint?: string; type?: string };

function fieldsFor(kind: Kind, available: PersonalNotificationChannels["available"], ntfyMode: "household" | "url"): Field[] {
  switch (kind) {
    case "telegram":
      return [
        {
          name: "chatId",
          label: "Your chat ID",
          placeholder: "123456789",
          hint: available.telegram.botUsername
            ? `Message @${available.telegram.botUsername} /start, then paste your chat ID (@userinfobot on Telegram tells you yours). Or use Connect with Telegram above.`
            : "Message the household's bot /start, then paste your chat ID (@userinfobot on Telegram tells you yours).",
        },
      ];
    case "pushover":
      return [{ name: "userKey", label: "Your user key", hint: "The 30-character key at the top of your pushover.net dashboard.", type: "password" }];
    case "email":
      return [{ name: "address", label: "Your email address", placeholder: "you@example.com", type: "email", hint: "We'll email a code to confirm it's yours first." }];
    case "discord":
      return [
        {
          name: "webhookUrl",
          label: "Discord webhook URL",
          placeholder: "https://discord.com/api/webhooks/…",
          type: "password",
          hint: "In your own server: channel settings › Integrations › Webhooks › New Webhook › Copy Webhook URL.",
        },
      ];
    case "ntfy":
      return ntfyMode === "household"
        ? [{ name: "topic", label: "Topic", placeholder: "pick-something-hard-to-guess", hint: `On ${available.ntfy.householdServer}. Subscribe to the same topic in the ntfy app.` }]
        : [{ name: "url", label: "Topic URL", placeholder: "https://ntfy.sh/your-topic", type: "password" }];
    case "webhook":
      return [
        {
          name: "url",
          label: "Webhook URL",
          placeholder: "https://example.com/hooks/marquee",
          type: "password",
          hint: available.webhook.homeNetwork
            ? "Marquee POSTs JSON: { event, preference, title, message, mediaType, tmdbId }."
            : "Marquee POSTs JSON: { event, preference, title, message, mediaType, tmdbId }. It must be on the internet, not your home network.",
        },
      ];
  }
}

function AddChannel({ available, onAdded }: { available: PersonalNotificationChannels["available"]; onAdded: () => void }) {
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((kind) => available[kind].available);
  const [kind, setKind] = useState<Kind>(kinds[0] ?? "discord");
  const [ntfyMode, setNtfyMode] = useState<"household" | "url">(available.ntfy.householdServer ? "household" : "url");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const polling = useRef(0);

  useEffect(() => () => void polling.current++, []);

  const missing = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => !available[k].available);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const config: Record<string, string> = {};
    for (const field of fieldsFor(kind, available, ntfyMode)) config[field.name] = String(form.get(field.name) ?? "");
    const result = await addChannelAction({ kind, name: String(form.get("name") ?? ""), config });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setNotice(
      kind === "email"
        ? "Check your inbox for the code."
        : kind === "telegram"
          ? "Check Telegram: the bot sent you a code to enter above."
          : "Added. A test message is on its way.",
    );
    onAdded();
  }

  async function connectTelegram() {
    setError(null);
    const started = await startTelegramLinkAction();
    if (!started.code || !started.url) {
      setError(started.error ?? "Couldn't start. Enter your chat ID instead.");
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
        setNotice("Telegram connected. A test message is on its way.");
        onAdded();
      }
      return;
    }
    if (run === polling.current) setLink(null);
  }

  if (kinds.length === 0) return null;
  // Email and a typed-in Telegram chat are confirmed with a code first.
  const sendsCode = kind === "email" || kind === "telegram";
  const fields = fieldsFor(kind, available, ntfyMode);

  return (
    <div className="px-6 py-5 text-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Add a channel</p>
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
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {kind === "telegram" && available.telegram.botUsername && (
        <div className="mt-4 rounded-xl border border-border bg-bg-0 p-4">
          <p className="text-text-secondary">
            Quickest: open the household&apos;s bot, <span className="text-text-primary">@{available.telegram.botUsername}</span>,
            press Start, and come back. Marquee finds your chat by itself.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={smallButton} onClick={connectTelegram} disabled={Boolean(link)}>
              {link ? "Waiting for Start…" : "Connect with Telegram"}
            </button>
            {link && (
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">
                Open Telegram again
              </a>
            )}
          </div>
        </div>
      )}

      {kind === "ntfy" && available.ntfy.householdServer && (
        <div className="mt-4 flex gap-4 text-xs text-text-secondary">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={ntfyMode === "household"} onChange={() => setNtfyMode("household")} className="accent-accent" />
            A topic on the household&apos;s server
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={ntfyMode === "url"} onChange={() => setNtfyMode("url")} className="accent-accent" />
            A full topic URL
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
          Name <span className="-mt-1 text-xs text-text-muted">Optional, like &ldquo;My phone&rdquo;</span>
          <input name="name" maxLength={60} autoComplete="off" className={inputClass} />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {notice && <p className="text-xs text-owned">{notice}</p>}
        <button type="submit" disabled={busy} className={`${primaryButton} self-start`}>
          {busy ? (sendsCode ? "Sending code…" : "Testing…") : sendsCode ? "Send code" : "Test & add"}
        </button>
      </form>
      {missing.length > 0 && (
        <p className="mt-4 text-xs text-text-muted">
          {missing.map((k) => KIND_LABEL[k]).join(", ").replace(/, ([^,]*)$/, " and $1")} can be added once the admin sets {missing.length === 1 ? "it" : "them"} up
          for the household.
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
    return list.map((row) => (
      <tr key={row.event} className="border-t border-border">
        <th scope="row" className="px-4 py-2 text-left font-normal text-text-primary">{row.label}</th>
        <td className={cell}>
          <input type="checkbox" aria-label={`${row.label}: bell`} checked={row.inApp} onChange={(e) => toggle(row.event, { inApp: e.target.checked })} className="h-4 w-4 accent-accent" />
        </td>
        <td className={cell}>
          <input type="checkbox" aria-label={`${row.label}: devices`} checked={row.push} onChange={(e) => toggle(row.event, { push: e.target.checked })} className="h-4 w-4 accent-accent" />
        </td>
        {usable.map((channel) => (
          <td key={channel.id} className={cell}>
            <input
              type="checkbox"
              aria-label={`${row.label}: ${channelLabel(channel)}`}
              checked={row.channels[channel.id] ?? false}
              onChange={(e) => toggle(row.event, { channels: { [channel.id]: e.target.checked } })}
              className="h-4 w-4 accent-accent"
            />
          </td>
        ))}
      </tr>
    ));
  }

  return (
    <div className="mt-4 max-w-2xl overflow-x-auto rounded-2xl border border-border bg-bg-1 text-sm">
      <table className="w-full min-w-[26rem]">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">Event</th>
            <th className={header}>Bell</th>
            <th className={header}>Devices</th>
            {usable.map((channel) => (
              <th key={channel.id} className={header}>
                {channelLabel(channel)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderRows(everyone)}
          {reviewer.length > 0 && (
            <tr className="border-t border-border">
              <th colSpan={3 + usable.length} className="px-4 pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                For reviewers
              </th>
            </tr>
          )}
          {renderRows(reviewer)}
        </tbody>
      </table>
      {(error || saving) && (
        <p className={`px-4 pb-3 text-xs ${error ? "text-red-400" : "text-text-muted"}`}>{error ?? "Saving…"}</p>
      )}
    </div>
  );
}
