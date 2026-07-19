import { resolutionTier, hdrLabel, audioLabel } from "@/lib/quality";

export function ResolutionBadge({ qualityName }: { qualityName: string | null | undefined }) {
  const tier = resolutionTier(qualityName);
  if (!tier) return null;

  const className =
    tier === "4K"
      ? "bg-accent/15 text-accent border-accent/30"
      : "bg-untracked-bg text-text-secondary border-border";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${className}`}
    >
      {tier}
    </span>
  );
}

export function DynamicRangeBadge({ dynamicRange }: { dynamicRange: string | null | undefined }) {
  const label = hdrLabel(dynamicRange);
  if (!label) return null;

  return (
    <span className="inline-flex items-center rounded-full border border-owned/30 bg-owned-bg px-2 py-0.5 text-[10px] font-medium text-owned">
      {label === "Dolby Vision" ? "DV" : label}
    </span>
  );
}

export function AudioBadge({ audioCodec }: { audioCodec: string | null | undefined }) {
  const label = audioLabel(audioCodec);
  if (!label) return null;

  return (
    <span className="inline-flex items-center rounded-full border border-tracked/30 bg-tracked-bg px-2 py-0.5 text-[10px] font-medium text-tracked">
      {label}
    </span>
  );
}
