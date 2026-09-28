"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startPlexAuth, checkPlexAuthStatus } from "@/app/settings/integrations/plex-actions";
import { testAndSaveJellyfinConnection } from "@/app/settings/integrations/jellyfin-actions";
import { DisconnectButton } from "@/components/disconnect-button";
import { ConnectionForm } from "@/components/settings/connection-form";
import { AddTile, ServiceTile, TILE_BUTTON } from "@/components/settings/settings-ui";
import { showToast } from "@/components/toast";
import { useT } from "@/lib/i18n/client";

type ServerSummary = { name: string | null; lastSyncedAt: string | null };

/**
 * Settings › Media servers: Plex and Jellyfin/Emby as tiles, like the
 * Sonarr and Radarr ones under Services. A connected one shows its
 * servers, what's synced and Disconnect (Jellyfin also Edit); one that
 * isn't is an "add" tile — Plex signs in through plex.tv, Jellyfin opens
 * its form under the tiles.
 */
export function MediaServerTiles({
  plex,
  jellyfin,
}: {
  plex: { connected: boolean; servers: ServerSummary[]; movieCount: number; tvCount: number };
  jellyfin: {
    existing: { baseUrl: string; publicUrl?: string | null; hasApiKey: boolean } | null;
    /** "Jellyfin" or "Emby" once connected and synced; null before. */
    name: string | null;
    servers: ServerSummary[];
    movieCount: number;
    tvCount: number;
  };
}) {
  const t = useT();
  const router = useRouter();
  const [plexConnected, setPlexConnected] = useState(plex.connected);
  const [plexCounts, setPlexCounts] = useState({ movies: plex.movieCount, shows: plex.tvCount });
  const [plexWaiting, setPlexWaiting] = useState(false);
  const [plexError, setPlexError] = useState<string | null>(null);
  const [editingJellyfin, setEditingJellyfin] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const jellyfinConnected = Boolean(jellyfin.existing?.hasApiKey);

  function stopPolling() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }

  function plexFailed(text: string) {
    setPlexError(text);
    setPlexWaiting(false);
    showToast(text, "error");
  }

  // The website polls every 2.5s and gives up after 2 minutes.
  async function connectPlex() {
    setPlexError(null);
    setPlexWaiting(true);
    const result = await startPlexAuth();
    if (result.error || !result.authUrl || !result.pinId) {
      plexFailed(result.error ?? t("integrations.plexStartFailed"));
      return;
    }
    window.open(result.authUrl, "_blank", "noopener,noreferrer");
    const deadline = Date.now() + 2 * 60 * 1000;
    const pinId = result.pinId;
    pollTimer.current = setInterval(async () => {
      if (Date.now() > deadline) {
        stopPolling();
        plexFailed(t("integrations.plexTimedOut"));
        return;
      }
      const status = await checkPlexAuthStatus(pinId);
      if (status.connected) {
        stopPolling();
        setPlexConnected(true);
        setPlexCounts({ movies: status.movieCount ?? 0, shows: status.tvCount ?? 0 });
        setPlexWaiting(false);
        showToast(t("integrations.connectedSuccessfully"));
        router.refresh();
      }
    }, 2500);
  }

  const serverNames = (servers: ServerSummary[]) =>
    servers
      .map((server) => server.name)
      .filter(Boolean)
      .join(", ");

  return (
    <div className="mt-9">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plexConnected ? (
          <ServiceTile
            title="Plex"
            address={serverNames(plex.servers) || undefined}
            status={{ ok: true, label: t("integrations.connected") }}
            actions={
              <DisconnectButton
                provider="plex"
                label="Plex"
                onSuccess={() => {
                  setPlexConnected(false);
                  setPlexCounts({ movies: 0, shows: 0 });
                }}
              />
            }
          >
            <p className="mt-3 text-sm text-text-secondary">{t("integrations.librarySummary", plexCounts)}</p>
            <p className="mt-1 text-xs text-text-muted">{t("integrations.librarySynced")}</p>
          </ServiceTile>
        ) : (
          <AddTile
            label={plexWaiting ? t("integrations.plexWaiting") : t("integrations.plexConnect")}
            onClick={connectPlex}
            disabled={plexWaiting}
          />
        )}

        {jellyfinConnected ? (
          <ServiceTile
            title={jellyfin.name ?? t("integrations.jellyfinTitle")}
            address={jellyfin.existing?.baseUrl}
            status={{ ok: true, label: t("integrations.connected") }}
            highlighted={editingJellyfin}
            actions={
              <>
                <button type="button" onClick={() => setEditingJellyfin(true)} disabled={editingJellyfin} className={TILE_BUTTON}>
                  {t("common.edit")}
                </button>
                <span className="ml-auto">
                  <DisconnectButton provider="jellyfin" label={jellyfin.name ?? "Jellyfin"} />
                </span>
              </>
            }
          >
            <p className="mt-3 text-sm text-text-secondary">
              {serverNames(jellyfin.servers) && `${serverNames(jellyfin.servers)} · `}
              {t("integrations.librarySummary", { movies: jellyfin.movieCount, shows: jellyfin.tvCount })}
            </p>
            <p className="mt-1 text-xs text-text-muted">{t("integrations.librarySynced")}</p>
          </ServiceTile>
        ) : (
          <AddTile label={t("settings.addJellyfin")} onClick={() => setEditingJellyfin(true)} active={editingJellyfin} />
        )}
      </ul>

      {plexWaiting && <p className="mt-3 text-xs text-text-muted">{t("integrations.plexFinishSignIn")}</p>}
      {!plexConnected && !plexWaiting && <p className="mt-3 text-xs text-text-muted">{t("integrations.plexSignInPrompt")}</p>}
      {plexError && <p className="mt-2 text-sm text-red-400">{plexError}</p>}

      {editingJellyfin && (
        <div className="mt-4">
          <ConnectionForm
            title={t("integrations.jellyfinTitle")}
            description={`${t("integrations.jellyfinIntro")} ${t("integrations.jellyfinApiKeyHelp")}`}
            connected={jellyfinConnected}
            fields={[
              {
                name: "baseUrl",
                label: t("integrations.serverUrl"),
                type: "url",
                required: true,
                defaultValue: jellyfin.existing?.baseUrl ?? "",
                placeholder: "http://localhost:8096", // i18n-ignore
              },
              {
                name: "publicUrl",
                label: t("integrations.publicUrl"),
                help: t("integrations.publicUrlHelp"),
                type: "url",
                defaultValue: jellyfin.existing?.publicUrl ?? "",
                placeholder: "https://jellyfin.example.com", // i18n-ignore
              },
              {
                name: "apiKey",
                label: t("integrations.apiKey"),
                type: "password",
                required: true,
                keepsSaved: false,
                placeholder: jellyfinConnected ? t("integrations.enterToReplace") : "",
              },
            ]}
            action={testAndSaveJellyfinConnection}
            savedText={t("integrations.connectedSuccessfully")}
            onSaved={() => {
              setEditingJellyfin(false);
              router.refresh();
            }}
            onCancel={() => setEditingJellyfin(false)}
          />
        </div>
      )}
    </div>
  );
}
