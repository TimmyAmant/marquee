import { iso, isoRequired } from "@/lib/api/mappers";
import { getAvailability, listChannels, type Actor, type PersonalChannel } from "@/lib/notifications/personal";
import { getHouseholdEvents, getPreferences } from "@/lib/notifications/preferences";
import type {
  HouseholdNotificationEvents,
  NotificationPreferences,
  PersonalNotificationChannel,
  PersonalNotificationChannels,
} from "@/lib/api/types";

// DTOs for /me/notification-channels, /me/notification-preferences and
// /settings/notification-events (docs/api-v1.md §8).

export function personalChannelDto(channel: PersonalChannel): PersonalNotificationChannel {
  return {
    id: channel.id,
    kind: channel.kind,
    name: channel.name,
    target: channel.target,
    enabled: channel.enabled,
    verified: channel.verified,
    lastSuccessAt: iso(channel.lastSuccessAt),
    lastError: channel.lastError,
    lastErrorAt: iso(channel.lastErrorAt),
    createdAt: isoRequired(channel.createdAt),
  };
}

export async function personalChannelsDto(actor: Actor): Promise<PersonalNotificationChannels> {
  const [available, channels] = await Promise.all([getAvailability(actor), listChannels(actor.id)]);
  return { available, channels: channels.map(personalChannelDto) };
}

export async function preferencesDto(actor: Actor): Promise<NotificationPreferences> {
  return { events: await getPreferences(actor.id, actor.role) };
}

export async function householdEventsDto(): Promise<HouseholdNotificationEvents> {
  return { events: await getHouseholdEvents() };
}
