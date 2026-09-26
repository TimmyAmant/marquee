"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/require-admin";
import { webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import { toArrServerDto, type ArrServerDto } from "@/lib/arr/servers";
import { parseArrKind, parseArrServerInput } from "@/lib/arr/server-input";
import {
  createArrServer,
  deleteArrServer,
  getArrServerOptions,
  regenerateArrServerSecret,
  testArrServerConnection,
  updateArrServer,
} from "@/lib/arr/server-manage";
import type { ArrPickerOptions } from "@/lib/arr/add-options-server";

// Settings → Integrations → Download Clients (components/arr-servers-card.tsx).
// Thin session wrappers over lib/arr/server-manage.ts, shared with
// /api/v1/settings/arr-servers. The client sends plain objects; everything
// is validated again here by the same parser the API uses.

const FORBIDDEN = "Only the admin can manage integrations.";

export type ArrServerActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function testArrServerAction(input: {
  kind?: unknown;
  serverId?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
}): Promise<ArrServerActionResult<ArrPickerOptions & { version: string | null }>> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { ok: false, error: admin.error };
  const parsed = parseArrServerInput({ baseUrl: input.baseUrl, apiKey: input.apiKey });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const result = await testArrServerConnection(admin.userId, {
    kind: input.kind,
    serverId: typeof input.serverId === "string" ? input.serverId : undefined,
    baseUrl: parsed.input.baseUrl,
    apiKey: parsed.input.apiKey,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    version: result.version,
    qualityProfiles: result.qualityProfiles,
    rootFolders: result.rootFolders,
    tags: result.tags,
  };
}

async function dto(server: Parameters<typeof toArrServerDto>[0]): Promise<ArrServerDto> {
  return toArrServerDto(server, webhookBaseUrl(await headers()));
}

/** Add (serverId null) or save an edited server. */
export async function saveArrServerAction(
  serverId: string | null,
  body: Record<string, unknown>,
): Promise<ArrServerActionResult<{ server: ArrServerDto }>> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!body || typeof body !== "object") return { ok: false, error: "Nothing to save." };
  const parsed = parseArrServerInput(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (serverId === null) {
    const kind = parseArrKind(body.kind);
    if (!kind) return { ok: false, error: '"kind" must be sonarr or radarr.' };
    const result = await createArrServer(admin.userId, kind, parsed.input);
    return result.ok ? { ok: true, server: await dto(result.server) } : { ok: false, error: result.error };
  }
  const result = await updateArrServer(admin.userId, serverId, parsed.input);
  return result.ok ? { ok: true, server: await dto(result.server) } : { ok: false, error: result.error };
}

export async function makeDefaultArrServerAction(serverId: string): Promise<ArrServerActionResult> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { ok: false, error: admin.error };
  const result = await updateArrServer(admin.userId, serverId, { isDefault: true });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function deleteArrServerAction(serverId: string): Promise<ArrServerActionResult> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { ok: false, error: admin.error };
  const result = await deleteArrServer(admin.userId, serverId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function regenerateArrServerSecretAction(
  serverId: string,
): Promise<ArrServerActionResult<{ webhookUrl: string }>> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { ok: false, error: admin.error };
  const result = await regenerateArrServerSecret(admin.userId, serverId);
  return result.ok ? { ok: true, webhookUrl: (await dto(result.server)).webhookUrl } : { ok: false, error: result.error };
}

export async function getArrServerOptionsAction(serverId: string): Promise<ArrServerActionResult<ArrPickerOptions>> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { ok: false, error: admin.error };
  const result = await getArrServerOptions(admin.userId, serverId);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, qualityProfiles: result.qualityProfiles, rootFolders: result.rootFolders, tags: result.tags };
}
