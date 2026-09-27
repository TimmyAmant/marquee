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
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";

// Settings → Integrations → Download Clients: every Sonarr and Radarr
// server, each with its own defaults and webhook URL (lib/arr/servers.ts).

const INPUT =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const LABEL = "flex flex-col gap-1.5 text-sm text-text-secondary";
const SMALL_BUTTON =
  "rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";
const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60";

const SERIES_TYPES: { value: SonarrSeriesType; label: MessageKey }[] = [
  { value: "standard", label: "integrations.seriesTypeStandard" },
  { value: "daily", label: "integrations.seriesTypeDaily" },
  { value: "anime", label: "integrations.seriesTypeAnime" },
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
  const t = useT();
  if (tags.length === 0) return <p className="text-xs text-text-muted">{t("integrations.serverHasNoTags")}</p>;
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
              onChange={() => onChange(on ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}
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
  const t = useT();
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
      setMessage({ tone: "ok", text: result.version
          ? t("integrations.arrConnectedVersion", { app: kindName(kind), version: result.version })
          : t("integrations.arrConnected"),
      });
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
          {t("integrations.name")}
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
          {t("integrations.serverUrl")}
          <input
            type="url"
            value={draft.baseUrl}
            placeholder={`http://localhost:${sonarr ? "8989" : "7878"}`} // i18n-ignore
            onChange={(e) => set("baseUrl", e.target.value)}
            className={INPUT}
          />
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          {t("integrations.apiKey")}
          <input
            type="password"
            value={draft.apiKey}
            autoComplete="off"
            placeholder={server ? t("integrations.apiKeySavedPlaceholder") : ""}
            onChange={(e) => set("apiKey", e.target.value)}
            className={INPUT}
          />
          {urlChanged && !draft.apiKey && (
            <span className="text-xs text-amber-300">{t("integrations.arrReenterApiKey")}</span>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-secondary">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.is4k} onChange={(e) => set("is4k", e.target.checked)} className="accent-accent" />
          {t("integrations.arr4kServer")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.isDefault}
            disabled={Boolean(server?.isDefault && server.is4k === draft.is4k)}
            onChange={(e) => set("isDefault", e.target.checked)}
            className="accent-accent"
          />
          {draft.is4k ? t("integrations.arrDefault4k", { app: kindName(kind) }) : t("integrations.arrDefault", { app: kindName(kind) })}
        </label>
        <button type="button" onClick={handleTest} disabled={busy || !draft.baseUrl} className={SMALL_BUTTON}>
          {isTesting ? t("integrations.testing") : t("common.test")}
        </button>
      </div>

      {options && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-sm text-text-secondary">{t("integrations.arrUsedWhenAdded")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL}>
              {t("integrations.qualityProfile")}
              <select
                value={draft.qualityProfileId ?? ""}
                onChange={(e) => set("qualityProfileId", e.target.value ? Number(e.target.value) : null)}
                className={INPUT}
              >
                <option value="">{t("integrations.pickOne")}</option>
                {options.qualityProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              {t("integrations.rootFolder")}
              <select
                value={draft.rootFolderPath ?? ""}
                onChange={(e) => set("rootFolderPath", e.target.value || null)}
                className={INPUT}
              >
                <option value="">{t("integrations.pickOne")}</option>
                {options.rootFolders.map((f) => (
                  <option key={f.id} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={LABEL}>
            {t("integrations.tags")}
            <TagChips tags={options.tags} selected={draft.tags} onChange={(tags) => set("tags", tags)} />
          </div>

          {sonarr && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>
                  {t("integrations.seriesType")}
                  <select
                    value={draft.seriesType}
                    onChange={(e) => set("seriesType", e.target.value as SonarrSeriesType)}
                    className={INPUT}
                  >
                    {SERIES_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {t(type.label)}
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
                  {t("integrations.seasonFolders")}
                </label>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{t("integrations.arrAnimeIntro")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>
                  {t("integrations.animeQualityProfile")}
                  <select
                    value={draft.animeQualityProfileId ?? ""}
                    onChange={(e) => set("animeQualityProfileId", e.target.value ? Number(e.target.value) : null)}
                    className={INPUT}
                  >
                    <option value="">{t("integrations.sameAsAbove")}</option>
                    {options.qualityProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={LABEL}>
                  {t("integrations.animeRootFolder")}
                  <select
                    value={draft.animeRootFolderPath ?? ""}
                    onChange={(e) => set("animeRootFolderPath", e.target.value || null)}
                    className={INPUT}
                  >
                    <option value="">{t("integrations.sameAsAbove")}</option>
                    {options.rootFolders.map((f) => (
                      <option key={f.id} value={f.path}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={LABEL}>
                <span>
                  {t("integrations.animeTags")}{" "}
                  <span className="text-xs text-text-muted">{t("integrations.animeTagsHint")}</span>
                </span>
                <TagChips tags={options.tags} selected={draft.animeTags} onChange={(tags) => set("animeTags", tags)} />
              </div>
            </>
          )}
        </div>
      )}

      {server && webhookUrl && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <WebhookUrlRow label={t("integrations.webhookUrl")} url={webhookUrl} />
          <p className="text-xs text-text-muted">
            {t("integrations.arrWebhookHelp", { app: kindName(kind) })}{" "}
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="underline underline-offset-2 hover:text-accent disabled:opacity-60"
            >
              {isRegenerating ? t("integrations.regenerating") : t("integrations.regenerateSecret")}
            </button>
          </p>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.tone === "error" ? "text-red-400" : "text-owned"}`}>{message.text}</p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={handleSave} disabled={busy || !canSave} className={PRIMARY_BUTTON}>
          {isSaving ? t("common.saving") : server ? t("common.save") : t("integrations.addServer")}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={SMALL_BUTTON}>
          {t("common.cancel")}
        </button>
        {!server && !options && <span className="text-xs text-text-muted">{t("integrations.testConnectionFirst")}</span>}
      </div>
    </div>
  );
}

function ServerRow({ server, editing, onEdit, onDone }: { server: ArrServerDto; editing: boolean; onEdit: () => void; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? t("common.somethingWentWrong"));
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
            {server.isDefault && <Badge tone="accent">{t("integrations.defaultBadge")}</Badge>}
            {server.is4k && <Badge>{/* i18n-ignore */}4K</Badge>}
            {!server.fullyConfigured && <Badge tone="warn">{t("integrations.needsProfileAndFolder")}</Badge>}
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
                {t("integrations.makeDefault")}
              </button>
            )}
            <button type="button" onClick={onEdit} className={SMALL_BUTTON}>
              {t("common.edit")}
            </button>
            {confirming ? (
              <>
                <span className="text-xs text-text-secondary">{t("integrations.removeServerConfirm", { name: server.name })}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => deleteArrServerAction(server.id))}
                  className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-60"
                >
                  {isPending ? t("integrations.removing") : t("common.remove")}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={SMALL_BUTTON}>
                  {t("integrations.keep")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline"
              >
                {t("common.remove")}
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
  const t = useT();
  const adding = editing === `new:${kind}`;
  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">{kindName(kind)}</h4>
        {!adding && (
          <button type="button" onClick={() => setEditing(`new:${kind}`)} className={SMALL_BUTTON}>
            {t("integrations.addArrServer", { app: kindName(kind) })}
          </button>
        )}
      </div>
      {servers.length === 0 && !adding && (
        <p className="mt-2 text-sm text-text-muted">
          {kind === "sonarr" ? t("integrations.noSonarrYet") : t("integrations.noRadarrYet")}
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
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <h3 className="font-display text-xl text-text-primary">
        {/* i18n-ignore */}
        Sonarr &amp; Radarr
      </h3>
      <p className="mt-1 text-sm text-text-secondary">{t("integrations.arrIntro")}</p>
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
