import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/integrations/credentials";
import { syncArrLibrary } from "@/lib/arr/sync";
import { debounce } from "@/lib/async/single-flight";
import { createNotification } from "@/lib/notifications/query";
import { notifyRequestersOfDownload } from "@/lib/requests/fulfilled";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { getClientIp, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit";
import type { ArrProvider } from "@/lib/db/schema";

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard that first — the
  // length check itself leaks nothing usable since secrets are fixed-length.
  return a.length === b.length && timingSafeEqual(a, b);
}

function isArrProvider(value: string): value is ArrProvider {
  return value === "sonarr" || value === "radarr";
}

type RadarrWebhookBody = {
  eventType?: string;
  movie?: { title?: string; tmdbId?: number };
};

type SonarrWebhookBody = {
  eventType?: string;
  series?: { title?: string; tvdbId?: number };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; userId: string }> },
) {
  const { provider: providerParam, userId } = await params;
  if (!isArrProvider(providerParam)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const provider = providerParam;

  // The header keeps the secret out of proxy and access logs; the query
  // string still works so webhooks set up before the header existed keep
  // going.
  const secret =
    request.headers.get("x-marquee-secret") ?? new URL(request.url).searchParams.get("secret");
  // A malformed id would make Postgres reject the uuid lookup and surface as
  // a 500 — it's just a wrong URL, so answer like any other bad credential.
  const expectedSecret = UUID_PATTERN.test(userId) ? await getWebhookSecret(userId) : null;
  if (!secret || !expectedSecret || !secretsMatch(secret, expectedSecret)) {
    // Limited only once the secret has failed, never ahead of checking it:
    // without a trusted proxy every sender shares one bucket (and even with
    // one, an address can be shared), so a limit in front of the check
    // would let anyone who fills it silence Sonarr/Radarr's real events. A
    // right secret always gets through; the secrets are far too long to
    // guess, so this only sheds load from whoever keeps trying.
    const rateKey = `webhook-auth:${getClientIp(request) ?? "unknown"}`;
    if (isRateLimited(rateKey, WEBHOOK_FAILED_AUTH_LIMIT)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    recordFailedAttempt(rateKey, WEBHOOK_RATE_WINDOW_MS);
    return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
  }

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
    const message =
      eventType === "Grab" ? `${title} started downloading` : `${title} finished downloading`;
    await createNotification({
      userId,
      mediaType,
      tmdbId,
      title,
      eventType: eventType === "Grab" ? "grabbed" : "downloaded",
      message,
      dedupeSince: new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS),
    }).catch(() => undefined);

    if (eventType === "Download") {
      await notifyRequestersOfDownload({ mediaType, tmdbId, title, exceptUserId: userId }).catch((err) => {
        console.error("[webhook] notifying requesters failed:", err);
      });
    }
  }

  // The queue/status is real-time in Sonarr/Radarr but Marquee's cache only
  // refreshes hourly (cron) or on next page visit past the 15-min staleness
  // gate — re-sync so the Library page reflects this event. Debounced and in
  // the background, so a burst of events answers fast and syncs once.
  debounce(`webhook-sync:${provider}:${userId}`, SYNC_DEBOUNCE_MS, () => {
    syncArrLibrary(userId, provider).catch((err) => {
      console.error(`[webhook] ${provider} sync failed for user ${userId}:`, err);
    });
  });

  return NextResponse.json({ ok: true });
}
