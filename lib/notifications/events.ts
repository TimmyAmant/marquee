import type { NotificationEventType, UserRole } from "@/lib/db/schema";
import { canReviewRequests } from "@/lib/users/roles";

// The events someone can choose to hear about, and where (Settings ›
// Account › Notifications). Finer than the notification's own eventType:
// a Plex Watchlist batch and a single new request are both
// `request_created`, but people want them apart. Pure; unit tested.

export const notificationPreferenceEventValues = [
  "request_approved",
  "request_declined",
  "request_available",
  "request_downloading",
  "issue_updated",
  // Reserved for comments on requests, which don't exist yet. Never listed
  // until they do; the apps take their rows (and labels) from the server,
  // so they'll show it without an update.
  "request_comment",
  // Someone in the household shared a title with you (lib/sharing).
  "title_shared",
  "request_pending",
  "issue_reported",
  "watchlist_requests",
] as const;
export type NotificationPreferenceEvent = (typeof notificationPreferenceEventValues)[number];

export function isPreferenceEvent(value: unknown): value is NotificationPreferenceEvent {
  return typeof value === "string" && (notificationPreferenceEventValues as readonly string[]).includes(value);
}

type EventInfo = {
  label: string;
  /** How the household channels' list puts it, where that differs. */
  householdLabel?: string;
  /** Who can get it at all. */
  audience: "everyone" | "reviewers" | "admin";
  /** Sent today; `request_comment` isn't yet. */
  live: boolean;
  /** A newly added personal channel gets it unless turned off. "Started
   * downloading" is off: it's chatty, and the bell already has it. */
  channelDefault: boolean;
  /** The household channels (Discord, ntfy, …) posted it before their
   * events could be chosen, so they still do by default. */
  householdDefault: boolean;
  /** Only ever for the one account (a title shared with you): never posted
   * to the household channels, and not in the admin's list of them. */
  personalOnly?: boolean;
};

export const NOTIFICATION_EVENTS: Record<NotificationPreferenceEvent, EventInfo> = {
  request_approved: { label: "A request is approved", audience: "everyone", live: true, channelDefault: true, householdDefault: true },
  request_declined: { label: "A request is declined", audience: "everyone", live: true, channelDefault: true, householdDefault: true },
  request_available: { label: "Ready to watch", audience: "everyone", live: true, channelDefault: true, householdDefault: true },
  request_downloading: { label: "Started downloading", audience: "everyone", live: true, channelDefault: false, householdDefault: true },
  issue_updated: { label: "A problem I reported is fixed", householdLabel: "A reported problem is fixed", audience: "everyone", live: true, channelDefault: true, householdDefault: false },
  request_comment: { label: "Comments on my requests", audience: "everyone", live: false, channelDefault: true, householdDefault: false },
  // In the bell and pushed to devices by default like everything else, but
  // off for a new personal channel: it's a nudge, not news.
  title_shared: { label: "Someone shares a title with me", audience: "everyone", live: true, channelDefault: false, householdDefault: false, personalOnly: true },
  request_pending: { label: "New request waiting for review", audience: "reviewers", live: true, channelDefault: true, householdDefault: true },
  issue_reported: { label: "New problem report", audience: "admin", live: true, channelDefault: true, householdDefault: true },
  watchlist_requests: { label: "Plex Watchlist requests", audience: "reviewers", live: true, channelDefault: true, householdDefault: true },
};

/** The events this role gets, in the order Settings lists them. */
export function eventsFor(role: UserRole | string | null | undefined): NotificationPreferenceEvent[] {
  return notificationPreferenceEventValues.filter((event) => {
    const info = NOTIFICATION_EVENTS[event];
    if (!info.live) return false;
    if (info.audience === "admin") return role === "admin";
    if (info.audience === "reviewers") return canReviewRequests(role);
    return true;
  });
}

/** Everything the household channels can post, in order. */
export const householdEvents = notificationPreferenceEventValues.filter(
  (event) => NOTIFICATION_EVENTS[event].live && !NOTIFICATION_EVENTS[event].personalOnly,
);

export const defaultHouseholdEvents = householdEvents.filter((event) => NOTIFICATION_EVENTS[event].householdDefault);

/** Which preference a notification falls under, when its creator didn't
 * say (a watchlist batch does). */
export function preferenceEventFor(eventType: NotificationEventType): NotificationPreferenceEvent {
  switch (eventType) {
    case "request_approved":
      return "request_approved";
    case "request_rejected":
      return "request_declined";
    case "downloaded":
      return "request_available";
    case "grabbed":
      return "request_downloading";
    case "issue_resolved":
      return "issue_updated";
    case "issue_reported":
      return "issue_reported";
    case "request_created":
      return "request_pending";
    case "title_shared":
      return "title_shared";
  }
}

export type BellPushOverrides = Record<string, { inApp?: boolean; push?: boolean } | undefined>;

/** In the bell, and pushed to devices? Both default to on: every
 * notification did both before these could be chosen. */
export function bellAndPushFor(
  overrides: BellPushOverrides | null | undefined,
  event: NotificationPreferenceEvent,
): { inApp: boolean; push: boolean } {
  const chosen = overrides?.[event];
  return { inApp: chosen?.inApp ?? true, push: chosen?.push ?? true };
}

export function channelWants(events: Record<string, boolean> | null | undefined, event: NotificationPreferenceEvent): boolean {
  const chosen = events?.[event];
  return typeof chosen === "boolean" ? chosen : NOTIFICATION_EVENTS[event].channelDefault;
}

/** The household channels' events: the saved list, or the defaults. */
export function householdWants(saved: readonly string[] | null | undefined, event: NotificationPreferenceEvent): boolean {
  if (NOTIFICATION_EVENTS[event].personalOnly) return false;
  return saved ? saved.includes(event) : NOTIFICATION_EVENTS[event].householdDefault;
}
