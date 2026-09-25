"use client";

import { useEffect, useState } from "react";
import { currentSubscription, enablePush, pushSupport, PUSH_PROMPT_DISMISSED_KEY } from "@/lib/push/browser";

type Mode = "hidden" | "ask" | "ios-home-screen";

function dismissed(): boolean {
  try {
    return localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, "1");
  } catch {
    // Private mode: it just asks again next time.
  }
}

/**
 * After signing in, asks whether this device should get notifications (a
 * request approved or declined, a title ready to watch). Only a card: the
 * browser's own permission dialog opens when "Turn on" is pressed, since
 * Safari only allows it from a click. Stays out of the way when the device
 * already gets them, when notifications are blocked, on plain http (no
 * browser allows push there), and after "Not now" until the next sign-in.
 * On an iPhone in a Safari tab it explains the Home Screen step instead.
 */
export function PushPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dismissed()) return;
    const support = pushSupport();
    let cancelled = false;
    if (support === "ios-home-screen") {
      // Deferred like the check below, so neither sets state inside the effect body.
      queueMicrotask(() => !cancelled && setMode("ios-home-screen"));
    } else if (support === "supported" && Notification.permission !== "denied") {
      currentSubscription()
        .then((subscription) => {
          if (!cancelled && !subscription) setMode("ask");
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === "hidden") return null;

  function close() {
    dismiss();
    setMode("hidden");
  }

  async function turnOn() {
    setBusy(true);
    setError(null);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      setMode("hidden");
      return;
    }
    if (result.reason === "denied") dismiss();
    setError(result.message);
  }

  return (
    <div
      role="dialog"
      aria-labelledby="push-prompt-title"
      className="nav-glass fixed bottom-4 left-4 right-4 z-50 rounded-2xl p-4 sm:left-auto sm:w-[340px]"
    >
      <p id="push-prompt-title" className="text-[15px] font-semibold text-text-primary">
        {mode === "ask" ? "Get notifications on this device?" : "Notifications on your iPhone or iPad"}
      </p>
      <p className="mt-1 text-[13px] leading-5 text-text-secondary">
        {mode === "ask"
          ? "Hear when a request is approved or declined and when something you asked for is ready to watch. They come straight from your Marquee server."
          : "Tap Share, then Add to Home Screen, and open Marquee from there. It can ask to send notifications once it's on your Home Screen."}
      </p>
      {error && <p className="mt-2 text-[12.5px] text-red-400">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-full px-3.5 py-1.5 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
        >
          {mode === "ask" ? "Not now" : "Got it"}
        </button>
        {mode === "ask" && (
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? "Turning on…" : "Turn on"}
          </button>
        )}
      </div>
    </div>
  );
}
