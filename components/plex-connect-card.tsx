"use client";

import { useRef, useState } from "react";
import { startPlexAuth, checkPlexAuthStatus } from "@/app/settings/integrations/plex-actions";
import { DisconnectButton } from "@/components/disconnect-button";
import { useT } from "@/lib/i18n/client";

type Phase = "idle" | "waiting" | "error";

export function PlexConnectCard({
  initialConnected,
  initialServers,
  initialMovieCount,
  initialTvCount,
}: {
  initialConnected: boolean;
  initialServers: { name: string | null; lastSyncedAt: string | null }[];
  initialMovieCount: number;
  initialTvCount: number;
}) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(initialConnected);
  const [servers] = useState(initialServers);
  const [movieCount, setMovieCount] = useState(initialMovieCount);
  const [tvCount, setTvCount] = useState(initialTvCount);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number>(0);

  function stopPolling() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }

  async function handleConnect() {
    setError(null);
    setPhase("waiting");

    const result = await startPlexAuth();
    if (result.error || !result.authUrl || !result.pinId) {
      setError(result.error ?? t("integrations.plexStartFailed"));
      setPhase("error");
      return;
    }

    window.open(result.authUrl, "_blank", "noopener,noreferrer");

    pollDeadline.current = Date.now() + 2 * 60 * 1000;
    pollTimer.current = setInterval(async () => {
      if (Date.now() > pollDeadline.current) {
        stopPolling();
        setError(t("integrations.plexTimedOut"));
        setPhase("error");
        return;
      }

      const status = await checkPlexAuthStatus(result.pinId!);
      if (status.connected) {
        stopPolling();
        setConnected(true);
        setMovieCount(status.movieCount ?? 0);
        setTvCount(status.tvCount ?? 0);
        setPhase("idle");
      }
    }, 2500);
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-text-primary">Plex</h3>
        <div className="flex items-center gap-3">
          {connected && (
            <span className="rounded-full border border-owned/30 bg-owned-bg px-3 py-1 text-xs text-owned">
              {t("integrations.connected")}
            </span>
          )}
          {connected && (
            <DisconnectButton
              provider="plex"
              label="Plex"
              onSuccess={() => {
                setConnected(false);
                setMovieCount(0);
                setTvCount(0);
              }}
            />
          )}
        </div>
      </div>

      {connected ? (
        <div className="mt-4">
          <p className="text-sm text-text-secondary">
            {servers.length > 0 && `${servers.map((s) => s.name).join(", ")} · `}
            {t("integrations.librarySummary", { movies: movieCount, shows: tvCount })}
          </p>
          <p className="mt-1 text-xs text-text-muted">{t("integrations.librarySynced")}</p>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-text-secondary">{t("integrations.plexSignInPrompt")}</p>
          <button
            onClick={handleConnect}
            disabled={phase === "waiting"}
            className="mt-4 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {phase === "waiting" ? t("integrations.plexWaiting") : t("integrations.plexConnect")}
          </button>
          {phase === "waiting" && (
            <p className="mt-2 text-xs text-text-muted">{t("integrations.plexFinishSignIn")}</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
