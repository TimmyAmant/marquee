"use client";

import { useState } from "react";
import { CapsLabel } from "@/components/caps-label";
import { formatBytes } from "@/lib/format";
import { resolutionTierOf } from "@/lib/quality";
import type { FileInfo } from "@/lib/integrations/status";

/** Media servers report a whole-file bitrate in the tens of thousands of
 * kbps — Mbps to one decimal is the readable form, with kbps kept for the
 * rare low-bitrate file where "0.4 Mbps" would lose the detail. */
function formatBitrate(kbps: number | null | undefined): string {
  if (!kbps || kbps <= 0) return "";
  if (kbps < 1000) return `${kbps} kbps`;
  return `${(kbps / 1000).toFixed(1)} Mbps`;
}

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
 * profile/Video, Dynamic range/Audio, then Container/Bitrate and
 * Edition/Release group — every pair the server didn't give us is simply
 * left out and the rest close up. The later rows are mostly how a Plex- or
 * Jellyfin-owned title fills the same grid a Radarr-tracked one does:
 * neither media server has a quality profile, a release group or an edition,
 * but both know the container and the bitrate, which neither *arr reports. */
export function FileDetailsSection({
  file,
  runtimeLabel,
}: {
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

  const tier = resolutionTierOf(file.quality, file.resolution);
  const audio = [file.audioCodec, file.audioChannels ? `${file.audioChannels}ch` : null]
    .filter(Boolean)
    .join(" ");

  // Every cell is driven by whether the value is there, not by media type:
  // for TV these used to be Radarr-shaped and therefore always empty, but a
  // Plex-owned show now carries codec/container/bitrate aggregated across its
  // episodes, and a Radarr-tracked movie still fills exactly the same cells
  // it always did.
  const cells: { label: string; value: string }[] = [
    { label: "Size", value: file.sizeBytes ? formatBytes(file.sizeBytes) : "" },
    { label: "Runtime", value: runtimeLabel ?? "" },
    { label: "Added", value: file.dateAdded ? new Date(file.dateAdded).toLocaleDateString() : "" },
    { label: "Resolution", value: tier ?? file.resolution ?? "" },
    { label: "Quality profile", value: file.quality ?? "" },
    { label: "Video", value: file.videoCodec ?? "" },
    { label: "Dynamic range", value: file.dynamicRange ?? "" },
    { label: "Audio", value: audio },
    { label: "Container", value: file.container ?? "" },
    { label: "Bitrate", value: formatBitrate(file.bitrateKbps) },
    { label: "Edition", value: file.edition ?? "" },
    { label: "Release group", value: file.releaseGroup ?? "" },
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
