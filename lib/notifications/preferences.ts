import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appSettings, notificationPreferences, userNotificationChannels, users } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import {
  bellAndPushFor,
  channelWants,
  eventsFor,
  householdEvents,
  householdWants,
  isPreferenceEvent,
  NOTIFICATION_EVENTS,
  type BellPushOverrides,
  type NotificationPreferenceEvent,
} from "@/lib/notifications/events";

// Settings › Account › Notifications' "what, where" matrix
// (GET/PUT /api/v1/me/notification-preferences), and the household
// channels' events (Settings › Integrations, admin). Only choices that
// differ from the defaults are stored, so an account nobody touched keeps
// following the defaults — lib/notifications/events.ts.

export type PreferenceRow = {
  event: NotificationPreferenceEvent;
  label: string;
  /** Only for reviewers (new requests, Plex Watchlist) or the admin (problem reports). */
  reviewerOnly: boolean;
  inApp: boolean;
  push: boolean;
  /** Channel id → on, for each of this account's own channels. */
  channels: Record<string, boolean>;
};

export async function loadBellPushOverrides(userId: string): Promise<BellPushOverrides> {
  const [row] = await db
    .select({ overrides: notificationPreferences.overrides })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return row?.overrides ?? {};
}

export async function getPreferences(userId: string, role: string): Promise<PreferenceRow[]> {
  const [overrides, channels] = await Promise.all([
    loadBellPushOverrides(userId),
    db
      .select({ id: userNotificationChannels.id, events: userNotificationChannels.events })
      .from(userNotificationChannels)
      .where(eq(userNotificationChannels.userId, userId))
      .orderBy(userNotificationChannels.createdAt),
  ]);
  return eventsFor(role).map((event) => ({
    event,
    label: NOTIFICATION_EVENTS[event].label,
    reviewerOnly: NOTIFICATION_EVENTS[event].audience !== "everyone",
    ...bellAndPushFor(overrides, event),
    channels: Object.fromEntries(channels.map((channel) => [channel.id, channelWants(channel.events, event)])),
  }));
}

type PreferenceChange = {
  event: NotificationPreferenceEvent;
  inApp?: boolean;
  push?: boolean;
  channels?: Record<string, boolean>;
};

/** Checks a PUT body: `{ events: [{ event, inApp?, push?, channels? }] }`.
 * Only this account's own channels can be named. Pure; unit tested. */
export function parsePreferenceChanges(
  body: unknown,
  allowedEvents: readonly NotificationPreferenceEvent[],
  ownChannelIds: ReadonlySet<string>,
): { ok: true; changes: PreferenceChange[] } | { ok: false; error: string } {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return { ok: false, error: 'Send "events": a list of { event, inApp?, push?, channels? }.' };
  if (events.length > 50) return { ok: false, error: "Too many changes at once." };
  const changes: PreferenceChange[] = [];
  for (const entry of events) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Each change must be an object." };
    const { event, inApp, push, channels } = entry as Record<string, unknown>;
    if (!isPreferenceEvent(event) || !allowedEvents.includes(event)) {
      return { ok: false, error: `"${String(event)}" isn't an event you can choose.` };
    }
    if (inApp !== undefined && typeof inApp !== "boolean") return { ok: false, error: '"inApp" must be true or false.' };
    if (push !== undefined && typeof push !== "boolean") return { ok: false, error: '"push" must be true or false.' };
    let channelChanges: Record<string, boolean> | undefined;
    if (channels !== undefined) {
      if (!channels || typeof channels !== "object" || Array.isArray(channels)) {
        return { ok: false, error: '"channels" must map channel ids to true or false.' };
      }
      channelChanges = {};
      for (const [id, on] of Object.entries(channels as Record<string, unknown>)) {
        // Someone else's channel reads exactly like one that doesn't exist.
        if (!ownChannelIds.has(id)) return { ok: false, error: "There's no channel with that id." };
        if (typeof on !== "boolean") return { ok: false, error: '"channels" must map channel ids to true or false.' };
        channelChanges[id] = on;
      }
    }
    changes.push({ event, inApp, push, channels: channelChanges });
  }
  return { ok: true, changes };
}

export async function savePreferences(userId: string, role: string, body: unknown): Promise<CoreResult> {
  const channels = await db
    .select({ id: userNotificationChannels.id, events: userNotificationChannels.events })
    .from(userNotificationChannels)
    .where(eq(userNotificationChannels.userId, userId));
  const parsed = parsePreferenceChanges(body, eventsFor(role), new Set(channels.map((c) => c.id)));
  if (!parsed.ok) return fail("invalid", parsed.error);

  const overrides: Record<string, { inApp?: boolean; push?: boolean }> = {};
  for (const [key, value] of Object.entries(await loadBellPushOverrides(userId))) if (value) overrides[key] = value;
  const channelEvents = new Map(channels.map((c) => [c.id, { ...c.events }]));
  for (const change of parsed.changes) {
    const current = { ...(overrides[change.event] ?? {}) };
    if (change.inApp !== undefined) current.inApp = change.inApp;
    if (change.push !== undefined) current.push = change.push;
    overrides[change.event] = current;
    for (const [id, on] of Object.entries(change.channels ?? {})) {
      channelEvents.get(id)![change.event] = on;
    }
  }

  await db
    .insert(notificationPreferences)
    .values({ userId, overrides, updatedAt: new Date() })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { overrides, updatedAt: new Date() } });
  const touched = new Set(parsed.changes.flatMap((c) => Object.keys(c.channels ?? {})));
  for (const id of touched) {
    await db
      .update(userNotificationChannels)
      .set({ events: channelEvents.get(id)!, updatedAt: new Date() })
      .where(and(eq(userNotificationChannels.id, id), eq(userNotificationChannels.userId, userId)));
  }
  return { ok: true };
}

/** The role, for the event list; read fresh so a new trusted member sees
 * the reviewer rows straight away. */
export async function roleOf(userId: string): Promise<string | null> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role ?? null;
}

// ── Household channels ──────────────────────────────────────────────────

const HOUSEHOLD_CACHE_MS = 30_000;
let householdCache: { value: string[] | null; expiresAt: number } | null = null;

async function savedHouseholdEvents(): Promise<string[] | null> {
  if (householdCache && Date.now() < householdCache.expiresAt) return householdCache.value;
  const [row] = await db
    .select({ events: appSettings.householdNotificationEvents })
    .from(appSettings)
    .limit(1);
  const value = row?.events ?? null;
  householdCache = { value, expiresAt: Date.now() + HOUSEHOLD_CACHE_MS };
  return value;
}

export async function householdPostsEvent(event: NotificationPreferenceEvent): Promise<boolean> {
  return householdWants(await savedHouseholdEvents(), event);
}

export type HouseholdEventRow = { event: NotificationPreferenceEvent; label: string; enabled: boolean };

export async function getHouseholdEvents(): Promise<HouseholdEventRow[]> {
  const saved = await savedHouseholdEvents();
  return householdEvents.map((event) => ({
    event,
    label: NOTIFICATION_EVENTS[event].householdLabel ?? NOTIFICATION_EVENTS[event].label,
    enabled: householdWants(saved, event),
  }));
}

/** `{ events: { request_approved: false, … } }`: changes; the rest stay. */
export async function saveHouseholdEvents(body: unknown): Promise<CoreResult> {
  const changes = (body as { events?: unknown } | null)?.events;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return fail("invalid", 'Send "events": { "<event>": true or false }.');
  }
  const current = new Set((await getHouseholdEvents()).filter((e) => e.enabled).map((e) => e.event as string));
  for (const [event, on] of Object.entries(changes as Record<string, unknown>)) {
    if (!isPreferenceEvent(event) || !householdEvents.includes(event)) {
      return fail("invalid", `"${event}" isn't an event the household channels can post.`);
    }
    if (typeof on !== "boolean") return fail("invalid", "Each event must be true or false.");
    if (on) current.add(event);
    else current.delete(event);
  }
  const events = householdEvents.filter((event) => current.has(event));
  const [existing] = await db.select({ id: appSettings.id }).from(appSettings).limit(1);
  if (existing) {
    await db
      .update(appSettings)
      .set({ householdNotificationEvents: events, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({ householdNotificationEvents: events });
  }
  householdCache = null;
  return { ok: true };
}
