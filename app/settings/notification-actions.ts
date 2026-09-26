"use server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createChannel,
  deleteChannel,
  pollTelegramLink,
  resendVerification,
  startTelegramLink,
  testChannel,
  updateChannel,
  verifyChannel,
  type Actor,
} from "@/lib/notifications/personal";
import { saveHouseholdEvents, savePreferences } from "@/lib/notifications/preferences";
import {
  householdEventsDto,
  personalChannelDto,
  personalChannelsDto,
  preferencesDto,
} from "@/lib/api/routes/notification-channels";
import { revalidateIntegrations } from "@/lib/integrations/manage";
import type {
  HouseholdNotificationEvents,
  NotificationPreferences,
  PersonalNotificationChannel,
  PersonalNotificationChannels,
} from "@/lib/api/types";

// Settings › Account › Notifications: your own channels and what each gets,
// the same operations as /api/v1/me/notification-channels and
// /me/notification-preferences. Every action acts only on the signed-in
// account; the channel id someone sends is always checked against it.

async function actor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, role: session.user.role ?? "member" };
}

export type ChannelsResult = { data?: PersonalNotificationChannels; error?: string };
export type ChannelResult = { channel?: PersonalNotificationChannel; error?: string };
export type PreferencesResult = { data?: NotificationPreferences; error?: string };

const SIGNED_OUT = "Sign in again.";

export async function getMyChannelsAction(): Promise<ChannelsResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  return { data: await personalChannelsDto(me) };
}

export async function addChannelAction(input: { kind: string; name?: string; config: Record<string, string> }): Promise<ChannelResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await createChannel(me, input);
  return result.ok ? { channel: personalChannelDto(result.channel) } : { error: result.error };
}

export async function updateChannelAction(
  id: string,
  input: { name?: string | null; enabled?: boolean; config?: Record<string, string> },
): Promise<ChannelResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await updateChannel(me, id, input);
  return result.ok ? { channel: personalChannelDto(result.channel) } : { error: result.error };
}

export async function removeChannelAction(id: string): Promise<{ error?: string }> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await deleteChannel(me.id, id);
  return result.ok ? {} : { error: result.error };
}

export async function testChannelAction(id: string): Promise<ChannelResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await testChannel(me, id);
  return result.ok ? { channel: personalChannelDto(result.channel) } : { error: result.error };
}

export async function verifyChannelAction(id: string, code: string): Promise<ChannelResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await verifyChannel(me.id, id, code);
  return result.ok ? { channel: personalChannelDto(result.channel) } : { error: result.error };
}

export async function resendCodeAction(id: string): Promise<ChannelResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await resendVerification(me.id, id);
  return result.ok ? { channel: personalChannelDto(result.channel) } : { error: result.error };
}

export async function startTelegramLinkAction(): Promise<{ code?: string; url?: string; error?: string }> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await startTelegramLink(me.id);
  return result.ok ? { code: result.code, url: result.url } : { error: result.error };
}

export async function pollTelegramLinkAction(code: string): Promise<ChannelResult & { pending?: boolean }> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await pollTelegramLink(me, code);
  if (!result.ok) return { error: result.error };
  return result.status === "pending" ? { pending: true } : { channel: personalChannelDto(result.channel) };
}

export async function getPreferencesAction(): Promise<PreferencesResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  return { data: await preferencesDto(me) };
}

export async function savePreferencesAction(
  events: { event: string; inApp?: boolean; push?: boolean; channels?: Record<string, boolean> }[],
): Promise<PreferencesResult> {
  const me = await actor();
  if (!me) return { error: SIGNED_OUT };
  const result = await savePreferences(me.id, me.role, { events });
  if (!result.ok) return { error: result.error };
  return { data: await preferencesDto(me) };
}

export async function saveHouseholdEventsAction(
  events: Record<string, boolean>,
): Promise<{ data?: HouseholdNotificationEvents; error?: string }> {
  const admin = await requireAdmin("Only the admin can change the household channels.");
  if (!admin.ok) return { error: admin.error };
  const result = await saveHouseholdEvents({ events });
  if (!result.ok) return { error: result.error };
  revalidateIntegrations();
  return { data: await householdEventsDto() };
}
