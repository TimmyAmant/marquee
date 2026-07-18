import { resolutionTier } from "@/lib/quality";

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
