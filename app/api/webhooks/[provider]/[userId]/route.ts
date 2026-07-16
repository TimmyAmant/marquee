import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/integrations/credentials";
import { syncArrLibrary } from "@/lib/arr/sync";
import { createNotification } from "@/lib/notifications/query";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import type { ArrProvider } from "@/lib/db/schema";

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

  const secret = new URL(request.url).searchParams.get("secret");
  const expectedSecret = await getWebhookSecret(userId);
  if (!secret || !expectedSecret || secret !== expectedSecret) {
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
    }).catch(() => undefined);
  }

  // The queue/status is real-time in Sonarr/Radarr but Marquee's cache only
  // refreshes hourly (cron) or on next page visit past the 15-min staleness
  // gate — re-sync now so the Library page reflects this event immediately.
  await syncArrLibrary(userId, provider).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
