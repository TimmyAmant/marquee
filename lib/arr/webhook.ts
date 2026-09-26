import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { ArrProvider } from "@/lib/db/schema";
import { syncArrLibrary } from "@/lib/arr/sync";
import { debounce } from "@/lib/async/single-flight";
import { createNotification } from "@/lib/notifications/query";
import { notifyRequestersOfDownload } from "@/lib/requests/fulfilled";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { getClientIp, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit";

// Inbound Sonarr/Radarr webhooks: the per-server URL
// (/api/webhooks/servers/{serverId}) and the older per-account ones
// (/api/webhooks/{sonarr|radarr|sonarr4k|radarr4k}/{userId}), which only
// differ in how the secret is checked.

// Only failed secrets count against this: Sonarr fires one event per episode,
// so a season-pack import is a legitimate burst of dozens of requests, and
// throttling those would drop "downloaded" notifications. Guessing secrets is
// what the limit is for.
const WEBHOOK_FAILED_AUTH_LIMIT = 10;
const WEBHOOK_RATE_WINDOW_MS = 60 * 1000;

/** Quiet period after the last event before re-syncing — a burst of
 * per-episode events collapses into one library sync. */
const SYNC_DEBOUNCE_MS = 5000;

/** A season pack imports as one Download event per episode, often over
 * several minutes. Within this window a repeat event for the same title
 * and event type is the same news, so it doesn't notify (or post to
 * Discord/ntfy/the webhook/push) again. */
const NOTIFICATION_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

export function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard that first — the
  // length check itself leaks nothing usable since secrets are fixed-length.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The secret a webhook sent: the header keeps it out of proxy and access
 * logs; the query string still works for webhooks set up before that. */
export function providedSecret(request: Request): string | null {
  return request.headers.get("x-marquee-secret") ?? new URL(request.url).searchParams.get("secret");
}

/** The answer to a wrong or missing secret. Limited only once the secret has
 * failed, never ahead of checking it: without a trusted proxy every sender
 * shares one bucket (and even with one, an address can be shared), so a
 * limit in front of the check would let anyone who fills it silence
 * Sonarr/Radarr's real events. A right secret always gets through; the
 * secrets are far too long to guess, so this only sheds load from whoever
 * keeps trying. */
export function rejectSecret(request: Request): NextResponse {
  const rateKey = `webhook-auth:${getClientIp(request) ?? "unknown"}`;
  if (isRateLimited(rateKey, WEBHOOK_FAILED_AUTH_LIMIT)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  recordFailedAttempt(rateKey, WEBHOOK_RATE_WINDOW_MS);
  return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
}

type RadarrWebhookBody = {
  eventType?: string;
  movie?: { title?: string; tmdbId?: number };
};

type SonarrWebhookBody = {
  eventType?: string;
  series?: { title?: string; tvdbId?: number };
};

/** After the secret checked out: notifies about a Grab or Download and
 * re-syncs the library. `ownerId` is the admin the server belongs to. */
export async function handleArrWebhookEvent(
  request: Request,
  target: { ownerId: string; kind: ArrProvider; fourK: boolean },
): Promise<NextResponse> {
  const { ownerId: userId, kind: provider, fourK } = target;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as { eventType?: unknown }).eventType !== "string") {
    return NextResponse.json({ error: "Malformed webhook payload" }, { status: 400 });
  }

  const eventType = (body as { eventType: string }).eventType;

  // Radarr/Sonarr send this when the user clicks "Test" while adding the
  // webhook in Connect settings — must succeed for setup to feel like it
  // worked, and there's nothing to record for it.
  if (eventType === "Test") {
    return NextResponse.json({ ok: true });
  }

  if (eventType !== "Grab" && eventType !== "Download") {
    // Radarr/Sonarr send many other event types (Rename, HealthIssue, etc.)
    // that this feature doesn't react to yet — acknowledge and ignore.
    return NextResponse.json({ ok: true });
  }

  let title: string | null = null;
  let tmdbId: number | null = null;
  const mediaType = provider === "radarr" ? "movie" : "tv";

  if (provider === "radarr") {
    const movie = (body as RadarrWebhookBody).movie;
    title = movie?.title ?? null;
    tmdbId = movie?.tmdbId ?? null;
  } else {
    const series = (body as SonarrWebhookBody).series;
    title = series?.title ?? null;
    tmdbId = series?.tvdbId != null ? await resolveTmdbIdFromTvdbId(series.tvdbId).catch(() => null) : null;
  }

  if (title && tmdbId != null) {
    const shown = fourK ? `${title} in 4K` : title;
    const message =
      eventType === "Grab" ? `${shown} started downloading` : `${shown} finished downloading`;
    await createNotification({
      userId,
      mediaType,
      tmdbId,
      title,
      eventType: eventType === "Grab" ? "grabbed" : "downloaded",
      message,
      dedupeSince: new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS),
      is4k: fourK,
    }).catch(() => undefined);

    if (eventType === "Download") {
      await notifyRequestersOfDownload({ mediaType, tmdbId, title, exceptUserId: userId, fourK }).catch((err) => {
        console.error("[webhook] notifying requesters failed:", err);
      });
    }
  }

  // The queue/status is real-time in Sonarr/Radarr but Marquee's cache only
  // refreshes hourly (cron) or on next page visit past the 15-min staleness
  // gate — re-sync so the Library page reflects this event. Debounced and in
  // the background, so a burst of events answers fast and syncs once.
  // The 4K servers aren't synced into the library (lib/arr/fourk.ts).
  if (fourK) return NextResponse.json({ ok: true });
  debounce(`webhook-sync:${provider}:${userId}`, SYNC_DEBOUNCE_MS, () => {
    syncArrLibrary(userId, provider).catch((err) => {
      console.error(`[webhook] ${provider} sync failed for user ${userId}:`, err);
    });
  });

  return NextResponse.json({ ok: true });
}
