import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/integrations/credentials";
import type { ArrInstance } from "@/lib/db/schema";
import { arrKindOf, isFourK } from "@/lib/arr/instances";
import { UUID_PATTERN } from "@/lib/arr/servers";
import { handleArrWebhookEvent, providedSecret, rejectSecret, secretsMatch } from "@/lib/arr/webhook";

// The per-account webhook URLs from before every server had its own
// (/api/webhooks/servers/{serverId}): …/sonarr/, …/radarr/ and the 4K
// …/sonarr4k/, …/radarr4k/, all with the account's one secret. They keep
// working for every server already pointed at them.

function isArrInstance(value: string): value is ArrInstance {
  return value === "sonarr" || value === "radarr" || value === "sonarr4k" || value === "radarr4k";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; userId: string }> },
) {
  const { provider: providerParam, userId } = await params;
  if (!isArrInstance(providerParam)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const secret = providedSecret(request);
  // A malformed id would make Postgres reject the uuid lookup and surface as
  // a 500 — it's just a wrong URL, so answer like any other bad credential.
  const expectedSecret = UUID_PATTERN.test(userId) ? await getWebhookSecret(userId) : null;
  if (!secret || !expectedSecret || !secretsMatch(secret, expectedSecret)) return rejectSecret(request);

  // The 4K Sonarr/Radarr post to …/sonarr4k/… and …/radarr4k/…: the same
  // payloads, and the same notifications with "in 4K" on them.
  return handleArrWebhookEvent(request, {
    ownerId: userId,
    kind: arrKindOf(providerParam),
    fourK: isFourK(providerParam),
  });
}
