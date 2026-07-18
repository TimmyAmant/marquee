"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { resolutionTier } from "@/lib/quality";
import type { FileInfo } from "@/lib/integrations/status";
import type { MediaType } from "@/lib/db/schema";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value}</p>
    </div>
  );
}

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
    <section>
      <h2 className="mb-4 font-display text-xl text-text-primary">File details</h2>
      <div className="rounded-2xl border border-border bg-bg-1 p-6">
        {file.path && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-text-muted">Location</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={file.path}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 font-mono text-xs text-text-primary outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-full border border-border-strong px-3 py-2 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 ${file.path ? "mt-5" : ""}`}>
          <DetailRow label="Size" value={formatBytes(file.sizeBytes)} />
          {runtimeLabel && <DetailRow label="Runtime" value={runtimeLabel} />}
          {file.dateAdded && (
            <DetailRow label="Added" value={new Date(file.dateAdded).toLocaleDateString()} />
          )}

          {mediaType === "movie" && (
            <>
              {(tier || file.resolution) && (
                <DetailRow label="Resolution" value={tier ?? file.resolution ?? ""} />
              )}
              {file.videoCodec && <DetailRow label="Video" value={file.videoCodec} />}
              {file.dynamicRange && <DetailRow label="Dynamic range" value={file.dynamicRange} />}
              {audio && <DetailRow label="Audio" value={audio} />}
              {file.quality && <DetailRow label="Quality profile" value={file.quality} />}
              {file.edition && <DetailRow label="Edition" value={file.edition} />}
              {file.releaseGroup && <DetailRow label="Release group" value={file.releaseGroup} />}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
