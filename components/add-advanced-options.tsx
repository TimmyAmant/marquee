"use client";

import { useState } from "react";
import { getAddOptionsAction } from "@/lib/arr/add-options-actions";
import { TagChips } from "@/components/arr-servers-card";
import type { AddOptions, AddOptionsServer } from "@/lib/arr/add-options-server";
import type { AddOverrides } from "@/lib/arr/add-options";
import type { MediaType, SonarrSeriesType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";

// "Advanced" under Approve and the admin's Add: which server a title goes to
// and with what quality profile, root folder, tags and (TV) series type.
// Closed, nothing extra is sent and the server's defaults apply as always.
// Open, its fields ride along with the form named by `formId` (the fields
// sit outside it in the page, tied to it with the `form` attribute), and
// `onChange` hears the picks for callers that don't post a form.

const SELECT =
  "rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent";

type Picks = {
  serverId: string;
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  tags: number[];
  seriesType: SonarrSeriesType | null;
};

function picksFor(server: AddOptionsServer): Picks {
  return {
    serverId: server.id,
    qualityProfileId: server.defaults.qualityProfileId,
    rootFolderPath: server.defaults.rootFolderPath,
    tags: server.defaults.tags,
    seriesType: server.defaults.seriesType,
  };
}

function toOverrides(picks: Picks): AddOverrides {
  return {
    serverId: picks.serverId,
    ...(picks.qualityProfileId ? { qualityProfileId: picks.qualityProfileId } : {}),
    ...(picks.rootFolderPath ? { rootFolderPath: picks.rootFolderPath } : {}),
    tags: picks.tags,
    ...(picks.seriesType ? { seriesType: picks.seriesType } : {}),
  };
}

type AdvancedArgs = {
  mediaType: MediaType;
  tmdbId: number;
  is4k?: boolean;
  onChange?: (overrides: AddOverrides | null) => void;
  /** The request being reviewed, or (forRequest) one being made: the
   * override rule that applies to it is what's picked at first. */
  requestId?: string;
  forRequest?: boolean;
};

export type AddAdvancedState = ReturnType<typeof useAddAdvancedOptions>;

/**
 * "Advanced": its open/closed state and the choices it loaded, for a caller
 * that draws its own toggle. The title page attaches it to the Add / Request
 * button as a chevron (a split button) and shows the panel on a line of its
 * own under the actions (AddAdvancedPanel).
 */
export function useAddAdvancedOptions({ mediaType, tmdbId, is4k = false, onChange, requestId, forRequest }: AdvancedArgs) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AddOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Picks | null>(null);

  function update(next: Picks) {
    setPicks(next);
    onChange?.(toOverrides(next));
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      onChange?.(null);
      return;
    }
    setOpen(true);
    if (options) {
      if (picks) onChange?.(toOverrides(picks));
      return;
    }
    setLoading(true);
    setError(null);
    const result = await getAddOptionsAction(mediaType, tmdbId, is4k, { requestId, forRequest }).catch(() => null);
    setLoading(false);
    if (!result || !result.ok) {
      setError(result?.error ?? t("title.couldntLoadServers"));
      return;
    }
    setOptions(result.options);
    const first = result.options.servers[0];
    if (first) update(picksFor(first));
  }

  return { open, toggle, options, error, loading, picks, update, mediaType, is4k };
}

/** The pickers, while "Advanced" is open; nothing when it's closed. Their
 * fields ride along with the form named by `formId`. */
export function AddAdvancedPanel({ state, formId }: { state: AddAdvancedState; formId?: string }) {
  const t = useT();
  const { open, options, error, loading, picks, update, mediaType, is4k } = state;
  if (!open) return null;
  const server = options?.servers.find((s) => s.id === picks?.serverId) ?? null;
  const tv = mediaType === "tv";

  return (
    <div className="flex max-w-sm flex-col gap-2 rounded-xl border border-border bg-bg-1 p-3 text-xs text-text-secondary">
      {loading && <p>{t("title.loadingServers")}</p>}
      {error && <p className="text-red-400">{error}</p>}
      {options && options.servers.length === 0 && (
        <p>{t("title.noServerSetUp", { server: `${is4k ? "4K " : ""}${tv ? "Sonarr" : "Radarr"}` })}</p>
      )}
      {options && picks && server && (
        <>
          {formId && <input type="hidden" name="advanced" value="1" form={formId} />}
          {options.isAnime && tv && <p className="text-text-muted">{t("title.tmdbListsAnime")}</p>}
          {options.rule && picks.serverId === options.rule.serverId && (
            <p className="text-text-muted">{t("title.overrideRuleApplies", { name: options.rule.name })}</p>
          )}
          <label className="flex flex-col gap-1">
            {t("title.server")}
            <select
              name="serverId"
              form={formId}
              value={picks.serverId}
              onChange={(e) => {
                const next = options.servers.find((s) => s.id === e.target.value);
                if (next) update(picksFor(next));
              }}
              className={SELECT}
            >
              {options.servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {t("title.serverOption", {
                    name: s.name,
                    isDefault: s.isDefault ? "yes" : "no",
                    reachable: s.reachable ? "yes" : "no",
                  })}
                </option>
              ))}
            </select>
          </label>
          {!server.reachable && (
            <p className="text-amber-300">
              {t("title.serverDidntAnswer", { name: server.name })}
            </p>
          )}
          <label className="flex flex-col gap-1">
            {t("title.qualityProfile")}
            <select
              name="qualityProfileId"
              form={formId}
              value={picks.qualityProfileId ?? ""}
              onChange={(e) => update({ ...picks, qualityProfileId: e.target.value ? Number(e.target.value) : null })}
              className={SELECT}
            >
              {server.qualityProfiles.length === 0 && <option value={picks.qualityProfileId ?? ""}>{t("title.serverDefault")}</option>}
              {server.qualityProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {t("title.rootFolder")}
            <select
              name="rootFolderPath"
              form={formId}
              value={picks.rootFolderPath ?? ""}
              onChange={(e) => update({ ...picks, rootFolderPath: e.target.value || null })}
              className={SELECT}
            >
              {server.rootFolders.length === 0 && <option value={picks.rootFolderPath ?? ""}>{t("title.serverDefault")}</option>}
              {server.rootFolders.map((f) => (
                <option key={f.id} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>
          </label>
          {tv && (
            <label className="flex flex-col gap-1">
              {t("title.seriesType")}
              <select
                name="seriesType"
                form={formId}
                value={picks.seriesType ?? "standard"}
                onChange={(e) => update({ ...picks, seriesType: e.target.value as SonarrSeriesType })}
                className={SELECT}
              >
                <option value="standard">{t("title.seriesTypeStandard")}</option>
                <option value="daily">{t("title.seriesTypeDaily")}</option>
                <option value="anime">{t("title.seriesTypeAnime")}</option>
              </select>
            </label>
          )}
          <div className="flex flex-col gap-1">
            {t("title.tags")}
            {server.reachable ? (
              <TagChips
                tags={server.tags}
                selected={picks.tags}
                onChange={(tags) => update({ ...picks, tags })}
                name="tags"
                form={formId}
              />
            ) : (
              <>
                <p className="text-text-muted">{t("title.savedTags")}</p>
                {picks.tags.map((tag) => (
                  <input key={tag} type="hidden" name="tags" value={tag} form={formId} />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The "Advanced" text toggle with its panel under it (the request review
 * row, the season picker, "Couldn't add"). */
export function AddAdvancedOptions({
  mediaType,
  tmdbId,
  is4k = false,
  formId,
  onChange,
  disabled = false,
  requestId,
  forRequest,
}: AdvancedArgs & { formId?: string; disabled?: boolean }) {
  const t = useT();
  const state = useAddAdvancedOptions({ mediaType, tmdbId, is4k, onChange, requestId, forRequest });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={state.toggle}
        disabled={disabled}
        aria-expanded={state.open}
        className="self-start text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline disabled:opacity-60"
      >
        {state.open ? t("title.hideAdvanced") : t("title.advanced")}
      </button>
      <AddAdvancedPanel state={state} formId={formId} />
    </div>
  );
}

/** "Advanced" as a chevron joined onto the right of the Add / Request
 * capsule (a split button); the panel itself is AddAdvancedPanel. */
export function AdvancedSplitToggle({
  state,
  disabled = false,
  tone = "accent",
}: {
  state: AddAdvancedState;
  disabled?: boolean;
  /** Matches the capsule it's joined to: filled (Add, Request) or outlined
   * in the accent colour (the 4K buttons). */
  tone?: "accent" | "outline";
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={state.toggle}
      disabled={disabled}
      aria-expanded={state.open}
      aria-label={t("title.advancedOptions")}
      title={t("title.advancedOptions")}
      className={`inline-flex h-8 shrink-0 items-center rounded-r-full pl-2 pr-2.5 transition-colors disabled:opacity-60 ${
        tone === "accent"
          ? "border-l border-bg-0/25 bg-accent text-bg-0 hover:bg-accent-hover"
          : "border border-l-0 border-accent text-accent hover:bg-accent hover:text-bg-0"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        aria-hidden
        className={`h-3.5 w-3.5 transition-transform ${state.open ? "rotate-180" : ""}`}
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
