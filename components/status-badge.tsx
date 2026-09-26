import { STATUS_TEXT, statusClasses, type LibraryStatus } from "@/lib/library/status-tone";

export type { LibraryStatus };

export function StatusBadge({
  status,
  compact = false,
}: {
  status: LibraryStatus;
  compact?: boolean;
}) {
  const text = STATUS_TEXT[status] ?? STATUS_TEXT.untracked;
  const className = statusClasses(status).pill;

  // Both sizes come from the design mockup: the poster-corner pill is 17px
  // tall with a 5px dot, the standalone one on a title page is a 32px
  // capsule with an 8px dot.
  if (compact) {
    return (
      <span
        className={`inline-flex h-[17px] items-center gap-1 rounded-[9px] border pl-[5px] pr-[6px] text-[10px] font-semibold leading-none shadow-[0_1px_4px_rgba(0,0,0,0.35)] backdrop-blur-sm ${className}`}
      >
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        {text.compactLabel}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-8 items-center gap-2 rounded-full border pl-3 pr-3.5 text-[13px] font-semibold ${className}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {text.label}
    </span>
  );
}
