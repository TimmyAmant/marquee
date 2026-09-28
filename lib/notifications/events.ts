import type { NotificationEventType } from "@/lib/db/schema";
import { can, type PermissionSubject } from "@/lib/users/permissions";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

// The events someone can choose to hear about, and where (Settings ›
// Account › Notifications). Finer than the notification's own eventType:
// a Plex Watchlist batch and a single new request are both
// `request_created`, but people want them apart. Pure; unit tested.

export const notificationPreferenceEventValues = [
  "request_approved",
  "request_declined",
  "request_available",
  "request_downloading",
  // "We're still looking for …": your approved request that Sonarr/Radarr
  // hasn't found yet (lib/requests/not-found.ts). Bell only by default.
  "request_still_looking",
  "issue_updated",
  // A new comment in a conversation you're part of: on your request or
  // problem report, or (reviewers) one you've joined (lib/comments).
  "request_comment",
  // Someone in the household shared a title with you (lib/sharing).
  "title_shared",
  "request_pending",
  // "Couldn't find …": an approved request Sonarr/Radarr hasn't found.
  "request_not_found",
  "issue_reported",
  "watchlist_requests",
] as const;
export type NotificationPreferenceEvent = (typeof notificationPreferenceEventValues)[number];

export function isPreferenceEvent(value: unknown): value is NotificationPreferenceEvent {
  return typeof value === "string" && (notificationPreferenceEventValues as readonly string[]).includes(value);
}

type EventInfo = {
  /** Its name in Settings (a message key: eventLabel()). */
  labelKey: MessageKey;
  /** How the household channels' list puts it, where that differs. */
  householdLabelKey?: MessageKey;
  /** Who can get it at all. */
  audience: "everyone" | "reviewers" | "admin";
  /** A newly added personal channel gets it unless turned off. "Started
   * downloading" is off: it's chatty, and the bell already has it. */
  channelDefault: boolean;
  /** The household channels (Discord, ntfy, …) posted it before their
   * events could be chosen, so they still do by default. */
  householdDefault: boolean;
  /** Pushed to devices unless turned off. Everything but "still looking"
   * was pushed before these could be chosen. */
  pushDefault?: boolean;
  /** Only ever for the one account (a title shared with you): never posted
   * to the household channels, and not in the admin's list of them. */
  personalOnly?: boolean;
};

export const NOTIFICATION_EVENTS: Record<NotificationPreferenceEvent, EventInfo> = {
  request_approved: { labelKey: "settings.eventRequestApproved", audience: "everyone", channelDefault: true, householdDefault: true },
  request_declined: { labelKey: "settings.eventRequestDeclined", audience: "everyone", channelDefault: true, householdDefault: true },
  request_available: { labelKey: "settings.eventRequestAvailable", audience: "everyone", channelDefault: true, householdDefault: true },
  request_downloading: { labelKey: "settings.eventRequestDownloading", audience: "everyone", channelDefault: false, householdDefault: true },
  request_still_looking: { labelKey: "settings.eventRequestStillLooking", audience: "everyone", channelDefault: false, householdDefault: false, pushDefault: false, personalOnly: true },
  issue_updated: { labelKey: "settings.eventIssueUpdated", householdLabelKey: "settings.eventIssueUpdatedHousehold", audience: "everyone", channelDefault: true, householdDefault: false },
  // Between the people in the conversation, so never the household channels.
  request_comment: { labelKey: "settings.eventRequestComment", audience: "everyone", channelDefault: true, householdDefault: false, personalOnly: true },
  // In the bell and pushed to devices by default like everything else, but
  // off for a new personal channel: it's a nudge, not news.
  title_shared: { labelKey: "settings.eventTitleShared", audience: "everyone", channelDefault: false, householdDefault: false, personalOnly: true },
  request_pending: { labelKey: "settings.eventRequestPending", audience: "reviewers", channelDefault: true, householdDefault: true },
  request_not_found: { labelKey: "settings.eventRequestNotFound", audience: "reviewers", channelDefault: true, householdDefault: true },
  issue_reported: { labelKey: "settings.eventIssueReported", audience: "admin", channelDefault: true, householdDefault: true },
  watchlist_requests: { labelKey: "settings.eventWatchlistRequests", audience: "reviewers", channelDefault: true, householdDefault: true },
};

/** An event's name for someone's own list, in `t`'s language. */
export function eventLabel(t: Translator, event: NotificationPreferenceEvent): string {
  return t(NOTIFICATION_EVENTS[event].labelKey);
}

/** An event's name in the household channels' list, in `t`'s language. */
export function householdEventLabel(t: Translator, event: NotificationPreferenceEvent): string {
  const info = NOTIFICATION_EVENTS[event];
  return t(info.householdLabelKey ?? info.labelKey);
}

/** The events this account gets, in the order Settings lists them:
 * reviewers' events for whoever may review requests. */
export function eventsFor(account: PermissionSubject): NotificationPreferenceEvent[] {
  return notificationPreferenceEventValues.filter((event) => {
    const info = NOTIFICATION_EVENTS[event];
    if (info.audience === "admin") return account.role === "admin";
    if (info.audience === "reviewers") return can(account, "reviewRequests");
    return true;
  });
}

/** Everything the household channels can post, in order. */
export const householdEvents = notificationPreferenceEventValues.filter(
  (event) => !NOTIFICATION_EVENTS[event].personalOnly,
);

export const defaultHouseholdEvents = householdEvents.filter((event) => NOTIFICATION_EVENTS[event].householdDefault);

/** Which preference a notification falls under, when its creator didn't
 * say (a watchlist batch does). */
export function preferenceEventFor(eventType: NotificationEventType): NotificationPreferenceEvent {
  switch (eventType) {
    case "request_approved":
      return "request_approved";
    // Taken off the server again: for the requester, as good as declined.
    case "request_rejected":
    case "request_removed":
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
    case "request_not_found":
      return "request_not_found";
    case "title_shared":
      return "title_shared";
    case "request_comment":
    case "issue_comment":
      return "request_comment";
  }
}

export type BellPushOverrides = Record<string, { inApp?: boolean; push?: boolean } | undefined>;

/** In the bell, and pushed to devices? Both default to on — every
 * notification did both before these could be chosen — except push for an
 * event that says otherwise ("still looking"). */
export function bellAndPushFor(
  overrides: BellPushOverrides | null | undefined,
  event: NotificationPreferenceEvent,
): { inApp: boolean; push: boolean } {
  const chosen = overrides?.[event];
  return { inApp: chosen?.inApp ?? true, push: chosen?.push ?? NOTIFICATION_EVENTS[event].pushDefault ?? true };
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
