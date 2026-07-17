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

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shadow backdrop-blur-sm ${config.className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {config.compactLabel}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${config.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
