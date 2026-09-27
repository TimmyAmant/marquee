"use client";

import { useCallback, useEffect, useState } from "react";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push/browser";
import { localizeDeviceLabel } from "@/lib/push/device-label";
import { useT } from "@/lib/i18n/client";
import { formatDate } from "@/lib/i18n/format";

type Device = { id: string; endpoint: string; label: string | null; createdAt: string; lastSuccessAt: string | null };

type State = {
  support: PushSupport | null;
  permission: NotificationPermission | null;
  thisEndpoint: string | null;
  devices: Device[];
};

/** Settings › Account › Notifications: turns them on or off for this
 * browser, sends a test, and lists the account's other browsers that get
 * them. The Mac and Windows apps notify on their own while they run and
 * aren't listed here. */
export function PushSettings() {
  const t = useT();
  const [state, setState] = useState<State>({ support: null, permission: null, thisEndpoint: null, devices: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const support = pushSupport();
    const subscription = await currentSubscription().catch(() => null);
    const res = await fetch("/api/push/subscriptions").catch(() => null);
    const devices = res?.ok ? ((await res.json()) as { devices: Device[] }).devices : [];
    setState({
      support,
      permission: support === "supported" ? Notification.permission : null,
      thisEndpoint: subscription?.endpoint ?? null,
      devices,
    });
  }, []);

  useEffect(() => {
    // Everything here is browser state (the service worker, permission), so
    // it's read after mount; the network call sets state once it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const enabledHere = Boolean(state.thisEndpoint && state.devices.some((d) => d.endpoint === state.thisEndpoint));
  const others = state.devices.filter((d) => d.endpoint !== state.thisEndpoint);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    await action();
    await refresh();
    setBusy(false);
  }

  const turnOn = () =>
    run(async () => {
      const result = await enablePush(t);
      if (!result.ok) setMessage({ tone: "error", text: result.message });
    });

  const turnOff = () => run(() => disablePush());

  const sendTest = () =>
    run(async () => {
      const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
      const data = res?.ok ? ((await res.json()) as { delivered: number }) : null;
      setMessage(
        data && data.delivered > 0
          ? { tone: "ok", text: t("settings.pushTestSent", { count: data.delivered }) }
          : { tone: "error", text: t("settings.pushTestNothing") },
      );
    });

  const removeDevice = (device: Device) =>
    run(async () => {
      await fetch("/api/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: device.endpoint }),
      }).catch(() => undefined);
    });

  let status: string;
  if (state.support === null) status = t("settings.checking");
  else if (state.support === "insecure") status = t("settings.pushInsecure");
  else if (state.support === "ios-home-screen") status = t("settings.pushIosHomeScreen");
  else if (state.support === "unsupported") status = t("settings.pushUnsupported");
  else if (state.permission === "denied") status = t("settings.pushBlocked");
  else status = enabledHere ? t("settings.pushOnHere") : t("settings.pushOffHere");

  const buttonClass =
    "rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6 text-sm">
      <p className="text-text-secondary">{status}</p>
      <p className="mt-2 text-xs text-text-muted">{t("settings.pushHelp")}</p>

      {state.support === "supported" && state.permission !== "denied" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {enabledHere ? (
            <>
              <button type="button" onClick={sendTest} disabled={busy} className={buttonClass}>
                {t("settings.sendTest")}
              </button>
              <button type="button" onClick={turnOff} disabled={busy} className={buttonClass}>
                {t("settings.turnOff")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={turnOn}
              disabled={busy}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? t("settings.turningOn") : t("settings.turnOnNotifications")}
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-3 text-xs ${message.tone === "ok" ? "text-owned" : "text-red-400"}`}>{message.text}</p>
      )}

      {others.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{t("settings.otherDevices")}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {others.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">{device.label ? localizeDeviceLabel(t, device.label) : t("settings.aBrowser")}</span>
                  <span className="block text-xs text-text-muted">{t("settings.deviceSince", { date: formatDate(t, device.createdAt, "medium") })}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeDevice(device)}
                  disabled={busy}
                  className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
                >
                  {t("common.remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
