"use client";

import { useState } from "react";
import { getAddOptionsAction } from "@/lib/arr/add-options-actions";
import { TagChips } from "@/components/arr-servers-card";
import type { AddOptions, AddOptionsServer } from "@/lib/arr/add-options-server";
import type { AddOverrides } from "@/lib/arr/add-options";
import type { MediaType, SonarrSeriesType } from "@/lib/db/schema";

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

export function AddAdvancedOptions({
  mediaType,
  tmdbId,
  is4k = false,
  formId,
  onChange,
  disabled = false,
}: {
  mediaType: MediaType;
  tmdbId: number;
  is4k?: boolean;
  formId?: string;
  onChange?: (overrides: AddOverrides | null) => void;
  disabled?: boolean;
}) {
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
    const result = await getAddOptionsAction(mediaType, tmdbId, is4k).catch(() => null);
    setLoading(false);
    if (!result || !result.ok) {
      setError(result?.error ?? "Couldn't load the servers.");
      return;
    }
    setOptions(result.options);
    const first = result.options.servers[0];
    if (first) update(picksFor(first));
  }

  const server = options?.servers.find((s) => s.id === picks?.serverId) ?? null;
  const tv = mediaType === "tv";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
        className="self-start text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline disabled:opacity-60"
      >
        {open ? "Hide advanced" : "Advanced"}
      </button>
      {open && (
        <div className="flex max-w-sm flex-col gap-2 rounded-xl border border-border bg-bg-1 p-3 text-xs text-text-secondary">
          {loading && <p>Loading servers…</p>}
          {error && <p className="text-red-400">{error}</p>}
          {options && options.servers.length === 0 && (
            <p>No {is4k ? "4K " : ""}{tv ? "Sonarr" : "Radarr"} is set up yet.</p>
          )}
          {options && picks && server && (
            <>
              {formId && <input type="hidden" name="advanced" value="1" form={formId} />}
              {options.isAnime && tv && <p className="text-text-muted">TMDb lists this as anime.</p>}
              <label className="flex flex-col gap-1">
                Server
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
                      {s.name}
                      {s.isDefault ? " (default)" : ""}
                      {s.reachable ? "" : " — not responding"}
                    </option>
                  ))}
                </select>
              </label>
              {!server.reachable && (
                <p className="text-amber-300">
                  {server.name} didn&apos;t answer, so only its saved defaults can be used.
                </p>
              )}
              <label className="flex flex-col gap-1">
                Quality profile
                <select
                  name="qualityProfileId"
                  form={formId}
                  value={picks.qualityProfileId ?? ""}
                  onChange={(e) => update({ ...picks, qualityProfileId: e.target.value ? Number(e.target.value) : null })}
                  className={SELECT}
                >
                  {server.qualityProfiles.length === 0 && <option value={picks.qualityProfileId ?? ""}>Server default</option>}
                  {server.qualityProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Root folder
                <select
                  name="rootFolderPath"
                  form={formId}
                  value={picks.rootFolderPath ?? ""}
                  onChange={(e) => update({ ...picks, rootFolderPath: e.target.value || null })}
                  className={SELECT}
                >
                  {server.rootFolders.length === 0 && <option value={picks.rootFolderPath ?? ""}>Server default</option>}
                  {server.rootFolders.map((f) => (
                    <option key={f.id} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </label>
              {tv && (
                <label className="flex flex-col gap-1">
                  Series type
                  <select
                    name="seriesType"
                    form={formId}
                    value={picks.seriesType ?? "standard"}
                    onChange={(e) => update({ ...picks, seriesType: e.target.value as SonarrSeriesType })}
                    className={SELECT}
                  >
                    <option value="standard">Standard</option>
                    <option value="daily">Daily</option>
                    <option value="anime">Anime</option>
                  </select>
                </label>
              )}
              <div className="flex flex-col gap-1">
                Tags
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
                    <p className="text-text-muted">Its saved tags.</p>
                    {picks.tags.map((t) => (
                      <input key={t} type="hidden" name="tags" value={t} form={formId} />
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
