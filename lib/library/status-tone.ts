// One place that decides what color each library status wears, so the poster
// corner badge, the strip along a poster's bottom edge, the search
// suggestion pill, the title page's status capsule and the color key all
// agree. The colors themselves are the --marquee-{owned,tracked,missing,soon}
// tokens in app/globals.css (dark + light); the Mac (Theme.swift) and Windows
// (Theme.xaml) apps define the same five tones.
//
// Every class below is a complete literal string so Tailwind's scanner
// generates it.

export type LibraryStatus =
  | "owned"
  | "tracked_downloading"
  | "tracked_monitored"
  | "coming_soon"
  | "untracked";

/** The five colors a status can wear. */
export type StatusTone = "owned" | "downloading" | "missing" | "soon" | "neutral";

/** Display order everywhere the statuses are listed (the color key). */
export const LIBRARY_STATUSES: readonly LibraryStatus[] = [
  "owned",
  "tracked_downloading",
  "tracked_monitored",
  "coming_soon",
  "untracked",
];

export function statusTone(status: LibraryStatus | null | undefined): StatusTone {
  switch (status) {
    case "owned":
      return "owned";
    case "tracked_downloading":
      return "downloading";
    case "tracked_monitored":
      return "missing";
    case "coming_soon":
      return "soon";
    default:
      // untracked, and any status a newer server sends that this build
      // doesn't know yet.
      return "neutral";
  }
}

/** `label` is the title page's capsule, `compactLabel` the poster corner
 * badge, `name` the short name lists and the color key use. */
export const STATUS_TEXT: Record<LibraryStatus, { label: string; compactLabel: string; name: string; meaning: string }> = {
  owned: {
    label: "Already in your library",
    compactLabel: "Owned",
    name: "In your library",
    meaning: "The file is in your library, ready to watch.",
  },
  tracked_downloading: {
    label: "Downloading",
    compactLabel: "Downloading",
    name: "Downloading",
    meaning: "It's downloading right now.",
  },
  tracked_monitored: {
    label: "Missing",
    compactLabel: "Missing",
    name: "Missing",
    meaning: "Added, but Sonarr/Radarr hasn't found a copy yet — it keeps looking.",
  },
  coming_soon: {
    label: "Coming soon",
    compactLabel: "Coming soon",
    name: "Coming soon",
    meaning: "Added, but it hasn't been released yet.",
  },
  untracked: {
    label: "Not in your library",
    compactLabel: "Not owned",
    name: "Not in your library",
    meaning: "Not added yet. Posters get no colored strip.",
  },
};

type ToneClasses = {
  /** Tinted capsule: background, text and border (badges, pills). */
  pill: string;
  /** The 3px strip along a poster's bottom edge — none for neutral. */
  strip: string | null;
};

export const TONE_CLASS: Record<StatusTone, ToneClasses> = {
  owned: {
    pill: "bg-owned-bg text-owned border-owned/30",
    strip: "bg-owned",
  },
  downloading: {
    pill: "bg-tracked-bg text-tracked border-tracked/30",
    strip: "bg-tracked",
  },
  missing: {
    pill: "bg-missing-bg text-missing border-missing/30",
    strip: "bg-missing",
  },
  soon: {
    pill: "bg-soon-bg text-soon border-soon/30",
    strip: "bg-soon",
  },
  neutral: {
    pill: "bg-untracked-bg text-text-secondary border-border",
    strip: null,
  },
};

export function statusClasses(status: LibraryStatus | null | undefined): ToneClasses {
  return TONE_CLASS[statusTone(status)];
}
