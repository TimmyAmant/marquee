"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { resolutionTier } from "@/lib/quality";
import type { FileInfo } from "@/lib/integrations/status";
import type { MediaType } from "@/lib/db/schema";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text-primary">{value}</span>
    </div>
  );
}

/** Lives in TitleHero's right-hand sidebar, stacked below the rating/status
 * card — narrow (w-72) rather than the page's full width, so rows are a
 * single label/value column instead of the multi-column grid a wider block
 * could afford, and the location field stacks its copy button underneath
 * instead of beside the input. */
export function FileDetailsSection({
  mediaType,
  file,
  runtimeLabel,
}: {
  mediaType: MediaType;
  file: FileInfo | null;
  /** Pre-formatted by the caller since movies ("1h 47m") and TV ("~42m/episode",
   * averaged from TMDb's per-episode runtimes) read differently. */
  runtimeLabel: string | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  async function handleCopy() {
    if (!file?.path) return;
    await navigator.clipboard.writeText(file.path).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const tier = resolutionTier(file.quality);
  const audio = [file.audioCodec, file.audioChannels ? `${file.audioChannels}ch` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-5 text-sm">
      <h2 className="mb-1 font-display text-lg text-text-primary">File details</h2>

      {file.path && (
        <div className="flex flex-col gap-1.5 border-t border-border py-2.5">
          <p className="text-xs text-text-muted">Location</p>
          <input
            type="text"
            readOnly
            value={file.path}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full truncate rounded-lg border border-border bg-bg-0 px-3 py-2 font-mono text-xs text-text-primary outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="self-start rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <DetailRow label="Size" value={formatBytes(file.sizeBytes)} />
      {runtimeLabel && <DetailRow label="Runtime" value={runtimeLabel} />}
      {file.dateAdded && (
        <DetailRow label="Added" value={new Date(file.dateAdded).toLocaleDateString()} />
      )}
      {/* Resolution/quality profile can come from Sonarr for TV too (a
          fallback when a media-server owns the title but Sonarr also
          tracks it) — only the Radarr-only mediaInfo fields below stay
          movie-gated, since Sonarr has no per-series equivalent. */}
      {(tier || file.resolution) && (
        <DetailRow label="Resolution" value={tier ?? file.resolution ?? ""} />
      )}
      {file.quality && <DetailRow label="Quality profile" value={file.quality} />}

      {mediaType === "movie" && (
        <>
          {file.videoCodec && <DetailRow label="Video" value={file.videoCodec} />}
          {file.dynamicRange && <DetailRow label="Dynamic range" value={file.dynamicRange} />}
          {audio && <DetailRow label="Audio" value={audio} />}
          {file.edition && <DetailRow label="Edition" value={file.edition} />}
          {file.releaseGroup && <DetailRow label="Release group" value={file.releaseGroup} />}
        </>
      )}
    </div>
  );
}
