"use client";

import { useState } from "react";
import { CapsLabel } from "@/components/caps-label";
import { formatBytes } from "@/lib/format";
import { resolutionTier } from "@/lib/quality";
import type { FileInfo } from "@/lib/integrations/status";
import type { MediaType } from "@/lib/db/schema";

/** One cell of the card's two-column grid: 11px label over a 13px value. */
function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] leading-[14px] text-text-muted">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-[13px] font-medium leading-[17px] text-text-primary">
        {value}
      </p>
    </div>
  );
}

/** Lives in TitleHero's right-hand rail, stacked 16px below the facts card.
 * Per Docs/DESIGN_TARGET.md: a LOCATION field with an inline Copy button,
 * then a 2-column grid of Size/Runtime, Added/Resolution, Quality
 * profile/Video, Dynamic range/Audio — every pair the server didn't give us
 * is simply left out and the rest close up. */
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

  // Resolution/quality profile can come from Sonarr for TV too (a fallback
  // when a media-server owns the title but Sonarr also tracks it) — only the
  // Radarr-only mediaInfo fields stay movie-gated, since Sonarr has no
  // per-series equivalent.
  const isMovie = mediaType === "movie";
  const cells: { label: string; value: string }[] = [
    { label: "Size", value: formatBytes(file.sizeBytes) },
    { label: "Runtime", value: runtimeLabel ?? "" },
    { label: "Added", value: file.dateAdded ? new Date(file.dateAdded).toLocaleDateString() : "" },
    { label: "Resolution", value: tier ?? file.resolution ?? "" },
    { label: "Quality profile", value: file.quality ?? "" },
    { label: "Video", value: isMovie ? (file.videoCodec ?? "") : "" },
    { label: "Dynamic range", value: isMovie ? (file.dynamicRange ?? "") : "" },
    { label: "Audio", value: isMovie ? audio : "" },
    { label: "Edition", value: isMovie ? (file.edition ?? "") : "" },
    { label: "Release group", value: isMovie ? (file.releaseGroup ?? "") : "" },
  ].filter((cell) => cell.value !== "");

  return (
    <div className="rounded-2xl border border-border bg-bg-1 px-[18px] pb-[18px] pt-[15px]">
      <h2 className="mb-3 font-display text-[16px] font-semibold leading-[22px] text-text-primary">
        File details
      </h2>

      {file.path && (
        <>
          <CapsLabel>Location</CapsLabel>
          <div className="mt-1.5 flex h-8 items-center gap-2 rounded-lg border border-border bg-bg-0 pl-2.5 pr-1">
            <input
              type="text"
              readOnly
              value={file.path}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-text-secondary outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border-strong bg-bg-3 px-2 text-[11px] font-semibold text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      {cells.length > 0 && (
        <div className="mt-3.5 grid grid-cols-2 gap-x-3.5 gap-y-3">
          {cells.map((cell) => (
            <DetailCell key={cell.label} label={cell.label} value={cell.value} />
          ))}
        </div>
      )}
    </div>
  );
}
