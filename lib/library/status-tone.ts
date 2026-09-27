import type { MessageKey, Translator } from "@/lib/i18n/translator";
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

type StatusText = { label: string; compactLabel: string; name: string; meaning: string };

/** `label` is the title page's capsule, `compactLabel` the poster corner
 * badge, `name` the short name lists and the color key use. */
const STATUS_TEXT_KEYS: Record<LibraryStatus, Record<keyof StatusText, MessageKey>> = {
  owned: {
    label: "title.statusOwnedLabel",
    compactLabel: "title.statusOwnedCompact",
    name: "title.statusOwnedName",
    meaning: "title.statusOwnedMeaning",
  },
  tracked_downloading: {
    label: "title.statusDownloadingName",
    compactLabel: "title.statusDownloadingName",
    name: "title.statusDownloadingName",
    meaning: "title.statusDownloadingMeaning",
  },
  tracked_monitored: {
    label: "title.statusMissingName",
    compactLabel: "title.statusMissingName",
    name: "title.statusMissingName",
    meaning: "title.statusMissingMeaning",
  },
  tracked_unmonitored: {
    label: "title.statusUnmonitoredName",
    compactLabel: "title.statusUnmonitoredName",
    name: "title.statusUnmonitoredName",
    meaning: "title.statusUnmonitoredMeaning",
  },
  coming_soon: {
    label: "title.statusComingSoonName",
    compactLabel: "title.statusComingSoonName",
    name: "title.statusComingSoonName",
    meaning: "title.statusComingSoonMeaning",
  },
  untracked: {
    label: "title.statusUntrackedName",
    compactLabel: "title.statusUntrackedCompact",
    name: "title.statusUntrackedName",
    meaning: "title.statusUntrackedMeaning",
  },
};

/** A status this build knows (a newer server may send one it doesn't). */
export function isLibraryStatus(value: unknown): value is LibraryStatus {
  return typeof value === "string" && (LIBRARY_STATUSES as readonly string[]).includes(value);
}

/** A library status in words, in the page's language; an unknown one reads
 * as "Not in your library". */
export function statusText(t: Translator, status: LibraryStatus | null | undefined): StatusText {
  const keys = STATUS_TEXT_KEYS[isLibraryStatus(status) ? status : "untracked"];
  return { label: t(keys.label), compactLabel: t(keys.compactLabel), name: t(keys.name), meaning: t(keys.meaning) };
}

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
export function statusColorsNote(t: Translator): string {
  return t("title.statusColorsNote");
}
