"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectIntegrationAction } from "@/app/settings/integrations/disconnect-actions";
import type { IntegrationProvider } from "@/lib/db/schema";

export function DisconnectButton({
  provider,
  label,
  onSuccess,
}: {
  provider: IntegrationProvider;
  label: string;
  /** Called after a successful disconnect, in addition to router.refresh()
   * — for parent components (e.g. PlexConnectCard) that hold their own
   * local "connected" state initialized once from a server-rendered prop,
   * which router.refresh() alone won't update on an already-mounted client
   * component. */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectIntegrationAction(provider);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      onSuccess?.();
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline"
      >
        Disconnect
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <span className="text-xs text-text-secondary">Disconnect {label}?</span>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={isPending}
        className="text-xs font-medium text-red-400 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {isPending ? "Disconnecting…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
