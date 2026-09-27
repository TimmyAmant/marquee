import type { SeasonPickerState } from "@/lib/requests/seasons";
import type { MessageKey } from "@/lib/i18n/translator";

/** The status pill beside a season in the request dialog, after Seerr's
 * "Not requested / Requested / Available" — with Marquee's own "Monitored"
 * (Sonarr is fetching it) kept apart from "Available" (it's on disk). */
export type SeasonPill = "notRequested" | "requested" | "available" | "monitored" | "unavailable";

export function seasonPill(state: SeasonPickerState): SeasonPill {
  switch (state) {
    case "requestable":
      return "notRequested";
    case "requested":
      return "requested";
    case "complete":
      return "available";
    case "monitored":
      return "monitored";
    default:
      return "unavailable";
  }
}

export const SEASON_PILL_LABELS: Record<SeasonPill, MessageKey> = {
  notRequested: "title.seasonNotRequested",
  requested: "title.requested",
  available: "title.seasonAvailable",
  monitored: "title.seasonMonitored",
  unavailable: "title.seasonUnavailable",
};

/** The header switch: on when every pickable season is picked. Flipping it
 * picks them all, or none. */
export function allPicked(selected: Set<number>, requestable: number[]): boolean {
  return requestable.length > 0 && requestable.every((n) => selected.has(n));
}

export function toggleAllSeasons(selected: Set<number>, requestable: number[]): Set<number> {
  return allPicked(selected, requestable) ? new Set() : new Set(requestable);
}
