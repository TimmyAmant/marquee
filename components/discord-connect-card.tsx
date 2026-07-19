"use client";

import { useActionState } from "react";
import { testAndSaveDiscordWebhook, disconnectDiscord } from "@/app/settings/integrations/discord-actions";

export function DiscordConnectCard({ connected }: { connected: boolean }) {
  const [state, formAction, isPending] = useActionState(testAndSaveDiscordWebhook, undefined);
  const [disconnectState, disconnectAction, isDisconnecting] = useActionState(
    disconnectDiscord,
    undefined,
  );

  const isConnected = state?.success ? true : disconnectState?.success ? false : connected;

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl text-text-primary">Discord notifications</h3>
          <p className="mt-1 text-xs text-text-muted">
            Posts a message to a Discord channel whenever something is grabbed, downloaded, or a
            request is approved/rejected — the same events shown in your in-app notifications.
          </p>
        </div>
        {isConnected && (
          <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
            Connected
          </span>
        )}
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Webhook URL
          <input
            type="password"
            name="webhookUrl"
            required
            placeholder={
              isConnected
                ? "•••••••••••••••• (enter to replace)"
                : "From a channel's Integrations → Webhooks settings in Discord"
            }
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        {state?.success && <p className="text-sm text-owned">Connected — check the channel for a test message.</p>}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Testing…" : "Test & save"}
        </button>
      </form>

      {isConnected && (
        <form action={disconnectAction} className="mt-3">
          <button
            type="submit"
            disabled={isDisconnecting}
            className="text-xs text-text-muted underline decoration-dotted hover:text-red-400 disabled:opacity-60"
          >
            {isDisconnecting ? "Removing…" : "Remove saved webhook"}
          </button>
          {disconnectState?.error && (
            <p className="mt-1 text-xs text-red-400">{disconnectState.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
