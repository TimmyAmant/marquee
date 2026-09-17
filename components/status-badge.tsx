export type LibraryStatus =
  | "owned"
  | "tracked_downloading"
  | "tracked_monitored"
  | "coming_soon"
  | "untracked";

const STATUS_CONFIG: Record<LibraryStatus, { label: string; compactLabel: string; className: string }> = {
  owned: {
    label: "Already in your library",
    compactLabel: "Owned",
    className: "bg-owned-bg text-owned border-owned/30",
  },
  tracked_downloading: {
    label: "Downloading",
    compactLabel: "Downloading",
    className: "bg-tracked-bg text-tracked border-tracked/30",
  },
  tracked_monitored: {
    label: "Missing",
    compactLabel: "Missing",
    className: "bg-tracked-bg text-tracked border-tracked/30",
  },
  coming_soon: {
    label: "Coming soon",
    compactLabel: "Coming soon",
    className: "bg-untracked-bg text-text-secondary border-border",
  },
  untracked: {
    label: "Not in your library",
    compactLabel: "Not owned",
    className: "bg-untracked-bg text-text-secondary border-border",
  },
};

export function StatusBadge({
  status,
  compact = false,
}: {
  status: LibraryStatus;
  compact?: boolean;
}) {
  const config = STATUS_CONFIG[status];

  // Both sizes come from the design mockup: the poster-corner pill is 17px
  // tall with a 5px dot, the standalone one on a title page is a 32px
  // capsule with an 8px dot.
  if (compact) {
    return (
      <span
        className={`inline-flex h-[17px] items-center gap-1 rounded-[9px] border pl-[5px] pr-[6px] text-[10px] font-semibold leading-none shadow-[0_1px_4px_rgba(0,0,0,0.35)] backdrop-blur-sm ${config.className}`}
      >
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        {config.compactLabel}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-8 items-center gap-2 rounded-full border pl-3 pr-3.5 text-[13px] font-semibold ${config.className}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
