"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteArrServerAction,
  getArrServerOptionsAction,
  makeDefaultArrServerAction,
  regenerateArrServerSecretAction,
  saveArrServerAction,
  testArrServerAction,
} from "@/app/settings/integrations/arr-server-actions";
import { WebhookUrlRow } from "@/components/webhook-settings-card";
import type { ArrServerDto } from "@/lib/arr/servers";
import type { ArrPickerOptions } from "@/lib/arr/add-options-server";
import type { ArrProvider, SonarrSeriesType } from "@/lib/db/schema";

// Settings → Integrations → Download Clients: every Sonarr and Radarr
// server, each with its own defaults and webhook URL (lib/arr/servers.ts).

const INPUT =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const LABEL = "flex flex-col gap-1.5 text-sm text-text-secondary";
const SMALL_BUTTON =
  "rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60";

const SERIES_TYPES: { value: SonarrSeriesType; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "daily", label: "Daily" },
  { value: "anime", label: "Anime" },
];

function kindName(kind: ArrProvider) {
  return kind === "sonarr" ? "Sonarr" : "Radarr";
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "warn" }) {
  const styles = {
    muted: "border-border-strong text-text-secondary",
    accent: "border-owned/30 bg-owned-bg text-owned",
    warn: "border-amber-400/40 text-amber-300",
  }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${styles}`}>{children}</span>;
}

/** A tag multi-select: one toggle chip per tag the server has. */
export function TagChips({
  tags,
  selected,
  onChange,
  name,
  form,
}: {
  tags: { id: number; label: string }[];
  selected: number[];
  onChange: (next: number[]) => void;
  /** Also posts the picks as repeated form fields under this name. */
  name?: string;
  /** The form those fields belong to, when they sit outside it. */
  form?: string;
}) {
  if (tags.length === 0) return <p className="text-xs text-text-muted">This server has no tags.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const on = selected.includes(tag.id);
        return (
          <label
            key={tag.id}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
              on ? "border-accent bg-accent/15 text-accent" : "border-border-strong text-text-secondary hover:border-accent"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              name={name}
              form={form}
              value={tag.id}
              checked={on}
              onChange={() => onChange(on ? selected.filter((t) => t !== tag.id) : [...selected, tag.id])}
            />
            {tag.label}
          </label>
        );
      })}
    </div>
  );
}

type Draft = {
  name: string;
  baseUrl: string;
  apiKey: string;
  is4k: boolean;
  isDefault: boolean;
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  tags: number[];
  seriesType: SonarrSeriesType;
  seasonFolders: boolean;
  animeQualityProfileId: number | null;
  animeRootFolderPath: string | null;
  animeTags: number[];
};

function draftFrom(server: ArrServerDto | null, kind: ArrProvider): Draft {
  return {
    name: server?.name ?? "",
    baseUrl: server?.baseUrl ?? "",
    apiKey: "",
    is4k: server?.is4k ?? false,
    isDefault: server?.isDefault ?? false,
    qualityProfileId: server?.qualityProfileId ?? null,
    rootFolderPath: server?.rootFolderPath ?? null,
    tags: server?.tags ?? [],
    seriesType: server?.seriesType ?? "standard",
    seasonFolders: server ? (server.seasonFolders ?? false) : kind === "sonarr",
    animeQualityProfileId: server?.animeQualityProfileId ?? null,
    animeRootFolderPath: server?.animeRootFolderPath ?? null,
    animeTags: server?.animeTags ?? [],
  };
}

function ServerEditor({
  kind,
  server,
  onDone,
}: {
  kind: ArrProvider;
  /** Null when adding a new server. */
  server: ArrServerDto | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(server, kind));
  const [options, setOptions] = useState<ArrPickerOptions | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [isTesting, startTest] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isRegenerating, startRegenerate] = useTransition();
  const [webhookUrl, setWebhookUrl] = useState(server?.webhookUrl ?? null);
  const sonarr = kind === "sonarr";

  // A saved server's pickers load straight away.
  useEffect(() => {
    if (!server) return;
    let cancelled = false;
    getArrServerOptionsAction(server.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setOptions(result);
      else setMessage({ tone: "error", text: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [server]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const urlChanged = Boolean(server && draft.baseUrl.trim().replace(/\/+$/, "") !== server.baseUrl);

  function handleTest() {
    setMessage(null);
    startTest(async () => {
      const result = await testArrServerAction({
        kind,
        serverId: server && !draft.apiKey ? server.id : undefined,
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey || undefined,
      });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setOptions(result);
      setDraft((d) => ({
        ...d,
        qualityProfileId: d.qualityProfileId ?? result.qualityProfiles[0]?.id ?? null,
        rootFolderPath: d.rootFolderPath ?? result.rootFolders[0]?.path ?? null,
      }));
      setMessage({ tone: "ok", text: result.version ? `Connected — ${kindName(kind)} ${result.version}.` : "Connected." });
    });
  }

  function handleSave() {
    setMessage(null);
    startSave(async () => {
      const body: Record<string, unknown> = {
        kind,
        name: draft.name,
        baseUrl: draft.baseUrl,
        is4k: draft.is4k,
        qualityProfileId: draft.qualityProfileId,
        rootFolderPath: draft.rootFolderPath,
        tags: draft.tags,
      };
      if (draft.apiKey) body.apiKey = draft.apiKey;
      // The default can only be handed over, not switched off.
      if (draft.isDefault) body.isDefault = true;
      if (sonarr) {
        body.seriesType = draft.seriesType;
        body.seasonFolders = draft.seasonFolders;
        body.animeQualityProfileId = draft.animeQualityProfileId;
        body.animeRootFolderPath = draft.animeRootFolderPath;
        body.animeTags = draft.animeTags;
      }
      const result = await saveArrServerAction(server?.id ?? null, body);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      onDone();
      router.refresh();
    });
  }

  function handleRegenerate() {
    if (!server) return;
    startRegenerate(async () => {
      const result = await regenerateArrServerSecretAction(server.id);
      if (result.ok) setWebhookUrl(result.webhookUrl);
      else setMessage({ tone: "error", text: result.error });
    });
  }

  const busy = isTesting || isSaving;
  const canSave = server ? true : Boolean(options);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-bg-0/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input
            type="text"
            value={draft.name}
            maxLength={60}
            placeholder={server ? "" : `${draft.is4k ? "4K " : ""}${kindName(kind)}`}
            onChange={(e) => set("name", e.target.value)}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          Server URL
          <input
            type="url"
            value={draft.baseUrl}
            placeholder={`http://localhost:${sonarr ? "8989" : "7878"}`}
            onChange={(e) => set("baseUrl", e.target.value)}
            className={INPUT}
          />
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          API key
          <input
            type="password"
            value={draft.apiKey}
            autoComplete="off"
            placeholder={server ? "Saved — enter a new one to replace it" : ""}
            onChange={(e) => set("apiKey", e.target.value)}
            className={INPUT}
          />
          {urlChanged && !draft.apiKey && (
            <span className="text-xs text-amber-300">Enter the API key again to change the URL.</span>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-secondary">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.is4k} onChange={(e) => set("is4k", e.target.checked)} className="accent-accent" />
          4K server
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.isDefault}
            disabled={Boolean(server?.isDefault && server.is4k === draft.is4k)}
            onChange={(e) => set("isDefault", e.target.checked)}
            className="accent-accent"
          />
          Default {draft.is4k ? "4K " : ""}
          {kindName(kind)}
        </label>
        <button type="button" onClick={handleTest} disabled={busy || !draft.baseUrl} className={SMALL_BUTTON}>
          {isTesting ? "Testing…" : "Test"}
        </button>
      </div>

      {options && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-sm text-text-secondary">Used when a title is added to this server:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL}>
              Quality profile
              <select
                value={draft.qualityProfileId ?? ""}
                onChange={(e) => set("qualityProfileId", e.target.value ? Number(e.target.value) : null)}
                className={INPUT}
              >
                <option value="">Pick one…</option>
                {options.qualityProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Root folder
              <select
                value={draft.rootFolderPath ?? ""}
                onChange={(e) => set("rootFolderPath", e.target.value || null)}
                className={INPUT}
              >
                <option value="">Pick one…</option>
                {options.rootFolders.map((f) => (
                  <option key={f.id} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={LABEL}>
            Tags
            <TagChips tags={options.tags} selected={draft.tags} onChange={(t) => set("tags", t)} />
          </div>

          {sonarr && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>
                  Series type
                  <select
                    value={draft.seriesType}
                    onChange={(e) => set("seriesType", e.target.value as SonarrSeriesType)}
                    className={INPUT}
                  >
                    {SERIES_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.seasonFolders}
                    onChange={(e) => set("seasonFolders", e.target.checked)}
                    className="accent-accent"
                  />
                  Season folders
                </label>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                For anime (TMDb says it&apos;s anime, or it&apos;s animation from Japan) — added as series type
                &ldquo;Anime&rdquo;:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>
                  Anime quality profile
                  <select
                    value={draft.animeQualityProfileId ?? ""}
                    onChange={(e) => set("animeQualityProfileId", e.target.value ? Number(e.target.value) : null)}
                    className={INPUT}
                  >
                    <option value="">Same as above</option>
                    {options.qualityProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={LABEL}>
                  Anime root folder
                  <select
                    value={draft.animeRootFolderPath ?? ""}
                    onChange={(e) => set("animeRootFolderPath", e.target.value || null)}
                    className={INPUT}
                  >
                    <option value="">Same as above</option>
                    {options.rootFolders.map((f) => (
                      <option key={f.id} value={f.path}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={LABEL}>
                Anime tags <span className="text-xs text-text-muted">(none picked: the tags above)</span>
                <TagChips tags={options.tags} selected={draft.animeTags} onChange={(t) => set("animeTags", t)} />
              </div>
            </>
          )}
        </div>
      )}

      {server && webhookUrl && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <WebhookUrlRow label="Webhook URL" url={webhookUrl} />
          <p className="text-xs text-text-muted">
            In {kindName(kind)} → Settings → Connect → Add → Webhook, paste this (method POST, on Grab and on
            Import). {" "}
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="underline underline-offset-2 hover:text-accent disabled:opacity-60"
            >
              {isRegenerating ? "Regenerating…" : "Regenerate secret"}
            </button>
          </p>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.tone === "error" ? "text-red-400" : "text-owned"}`}>{message.text}</p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={handleSave} disabled={busy || !canSave} className={PRIMARY_BUTTON}>
          {isSaving ? "Saving…" : server ? "Save" : "Add server"}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={SMALL_BUTTON}>
          Cancel
        </button>
        {!server && !options && <span className="text-xs text-text-muted">Test the connection first.</span>}
      </div>
    </div>
  );
}

function ServerRow({ server, editing, onEdit, onDone }: { server: ArrServerDto; editing: boolean; onEdit: () => void; onDone: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-border bg-bg-1 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text-primary">{server.name}</span>
            {server.isDefault && <Badge tone="accent">Default</Badge>}
            {server.is4k && <Badge>4K</Badge>}
            {!server.fullyConfigured && <Badge tone="warn">Needs a profile and folder</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-text-muted">{server.baseUrl}</p>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            {!server.isDefault && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => makeDefaultArrServerAction(server.id))}
                className={SMALL_BUTTON}
              >
                Make default
              </button>
            )}
            <button type="button" onClick={onEdit} className={SMALL_BUTTON}>
              Edit
            </button>
            {confirming ? (
              <>
                <span className="text-xs text-text-secondary">Remove {server.name}?</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => deleteArrServerAction(server.id))}
                  className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-60"
                >
                  {isPending ? "Removing…" : "Remove"}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={SMALL_BUTTON}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {editing && <ServerEditor kind={server.kind} server={server} onDone={onDone} />}
    </li>
  );
}

function KindSection({
  kind,
  servers,
  editing,
  setEditing,
}: {
  kind: ArrProvider;
  servers: ArrServerDto[];
  editing: string | null;
  setEditing: (key: string | null) => void;
}) {
  const adding = editing === `new:${kind}`;
  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">{kindName(kind)}</h4>
        {!adding && (
          <button type="button" onClick={() => setEditing(`new:${kind}`)} className={SMALL_BUTTON}>
            Add a {kindName(kind)} server
          </button>
        )}
      </div>
      {servers.length === 0 && !adding && (
        <p className="mt-2 text-sm text-text-muted">
          No {kindName(kind)} yet — add one to send {kind === "sonarr" ? "shows" : "movies"} straight to your download
          queue.
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {servers.map((server) => (
          <ServerRow
            key={server.id}
            server={server}
            editing={editing === server.id}
            onEdit={() => setEditing(server.id)}
            onDone={() => setEditing(null)}
          />
        ))}
      </ul>
      {adding && <ServerEditor kind={kind} server={null} onDone={() => setEditing(null)} />}
    </div>
  );
}

export function ArrServersCard({ servers }: { servers: ArrServerDto[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <h3 className="font-display text-xl text-text-primary">Sonarr &amp; Radarr</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Add as many servers as you run. Titles go to the default one unless you pick another under
        &ldquo;Advanced&rdquo; when approving or adding. A title on any standard server counts as in your library;
        4K servers take 4K requests.
      </p>
      <div className="mt-5 flex flex-col gap-6">
        {(["sonarr", "radarr"] as const).map((kind) => (
          <KindSection
            key={kind}
            kind={kind}
            servers={servers.filter((s) => s.kind === kind)}
            editing={editing}
            setEditing={setEditing}
          />
        ))}
      </div>
    </div>
  );
}
