// One place that decides what color each library status wears, so the poster
// corner badge, the strip along a poster's bottom edge, the search
// suggestion pill, the title page's status capsule and the color key all
// agree. The hues follow Radarr's and Sonarr's own legends (green on disk,
// purple downloading, red missing, orange not monitored, blue unreleased),
// so a title reads the same here as it does there. The colors themselves
// are the --marquee-{owned,downloading,missing,unmonitored,soon} tokens in
// app/globals.css (dark + light); the Mac (Theme.swift) and Windows
// (App.xaml) apps define the same six tones.
//
// Every class below is a complete literal string so Tailwind's scanner
// generates it.

export type LibraryStatus =
  | "owned"
  | "tracked_downloading"
  | "tracked_monitored"
  /** In Sonarr/Radarr, but not monitored and nothing on disk — it won't
   * download on its own. Newer than the other values: older apps read it as
   * an unknown status (neutral). */
  | "tracked_unmonitored"
  | "coming_soon"
  | "untracked";

/** The six colors a status can wear. */
export type StatusTone = "owned" | "downloading" | "missing" | "unmonitored" | "soon" | "neutral";

/** Display order everywhere the statuses are listed (the color key). */
export const LIBRARY_STATUSES: readonly LibraryStatus[] = [
  "owned",
  "tracked_downloading",
  "tracked_monitored",
  "tracked_unmonitored",
  "coming_soon",
  "untracked",
];

/** Nothing on disk and nothing that will download on its own: no status at
 * all (a poster grid's "not in the library"), not in Sonarr/Radarr, or in
 * there but not monitored. Requests and Add (which turns monitoring back on
 * for a title the app already has) stay open for these; anything else is
 * already in the library or on its way. */
export function isUnwanted(status: LibraryStatus | null | undefined): boolean {
  return status == null || status === "untracked" || status === "tracked_unmonitored";
}

export function statusTone(status: LibraryStatus | null | undefined): StatusTone {
  switch (status) {
    case "owned":
      return "owned";
    case "tracked_downloading":
      return "downloading";
    case "tracked_monitored":
      return "missing";
    case "tracked_unmonitored":
      return "unmonitored";
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
    meaning: "It's downloading or queued right now.",
  },
  tracked_monitored: {
    label: "Missing",
    compactLabel: "Missing",
    name: "Missing",
    meaning: "Monitored, but Sonarr/Radarr hasn't found a copy yet — it keeps looking.",
  },
  tracked_unmonitored: {
    label: "Not monitored",
    compactLabel: "Not monitored",
    name: "Not monitored",
    meaning: "In Sonarr/Radarr but not monitored — it won't download on its own.",
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
    pill: "bg-downloading-bg text-downloading border-downloading/30",
    strip: "bg-downloading",
  },
  missing: {
    pill: "bg-missing-bg text-missing border-missing/30",
    strip: "bg-missing",
  },
  unmonitored: {
    pill: "bg-unmonitored-bg text-unmonitored border-unmonitored/30",
    strip: "bg-unmonitored",
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

/** The one-line note under every color key and on the help page. */
export const STATUS_COLORS_NOTE = "Same colors as Radarr and Sonarr.";
