import type { ChangelogEntry } from "@/lib/changelog";

// The "What's new" pop-up after the server is upgraded (components/whats-new.tsx).
// Pure, so the rules are tested here and ported case for case to the Mac
// (App/WhatsNew.swift) and Windows (Marquee.Core/Updates/WhatsNew.cs) apps.
//
// Each device remembers the last server version whose notes it showed. On
// the first visit nothing is remembered: the current version is stored and
// nothing shows, so a new device isn't greeted with a wall of notes. After
// that, a newer server version shows every changelog entry since the
// remembered one (newest first, at most WHATS_NEW_CAP), once.

/** How many releases the pop-up lists; "See all changes" has the rest. */
export const WHATS_NEW_CAP = 10;

/**
 * A dotted version ("0.45.3", "v0.45.3") as numbers, most significant first.
 * A pre-release suffix ("-beta.1") or build metadata ("+abc") is ignored.
 * Null for anything else.
 */
export function parseVersion(text: string | null | undefined): number[] | null {
  if (typeof text !== "string") return null;
  let trimmed = text.trim();
  if (trimmed.startsWith("v") || trimmed.startsWith("V")) trimmed = trimmed.slice(1);
  const core = trimmed.split(/[-+]/, 1)[0];
  const parts = core.split(".");
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map((part) => Number(part));
}

/** Part by part, a missing part counting as 0: -1, 0 or 1. Unparseable sorts first. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return a ? 1 : b ? -1 : 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export type WhatsNewDecision =
  /** Nothing remembered on this device (or something unreadable): remember `current`, show nothing. */
  | { kind: "first-run" }
  /** Same version, or older (a downgrade): nothing to do. */
  | { kind: "none" }
  /** Show what changed after `since`. */
  | { kind: "show"; since: string };

export function decideWhatsNew(stored: string | null, current: string): WhatsNewDecision {
  if (!parseVersion(current)) return { kind: "none" };
  if (!stored || !parseVersion(stored)) return { kind: "first-run" };
  return compareVersions(current, stored) > 0 ? { kind: "show", since: stored } : { kind: "none" };
}

export type WhatsNewSelection = {
  /** Newest first, at most `cap`. */
  entries: ChangelogEntry[];
  /** More releases than `cap` fall in the range. */
  hasMore: boolean;
};

/** The releases newer than `since`, up to and including `upTo`, newest first. */
export function selectWhatsNew(
  changelog: readonly ChangelogEntry[],
  since: string,
  upTo: string,
  cap: number = WHATS_NEW_CAP,
): WhatsNewSelection {
  const inRange = changelog
    .filter((entry) => compareVersions(entry.version, since) > 0 && compareVersions(entry.version, upTo) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
  return { entries: inRange.slice(0, cap), hasMore: inRange.length > cap };
}

/** The localStorage key: per server (origin) and per account. */
export function whatsNewStorageKey(origin: string, userId: string): string {
  return `marquee:whats-new:${origin}:${userId}`;
}
