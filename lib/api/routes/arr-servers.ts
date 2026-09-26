import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { apiJson } from "@/lib/api/errors";
import { unwrap } from "@/lib/api/guards";
import { invalid, parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import { listArrServers, toArrServerDto, type ArrServerDto } from "@/lib/arr/servers";
import { parseArrKind, parseArrServerInput, type ArrServerInput } from "@/lib/arr/server-input";
import {
  SERVER_NOT_FOUND,
  createArrServer,
  deleteArrServer,
  getArrServerOptions,
  regenerateArrServerSecret,
  testArrServerConnection,
  updateArrServer,
} from "@/lib/arr/server-manage";
import type { ArrPickerOptions } from "@/lib/arr/add-options-server";
import type { Ok } from "@/lib/api/types";

// /api/v1/settings/arr-servers — every Sonarr and Radarr server (admin only,
// like everything else under Settings → Integrations). The API key is never
// returned; each server's own webhook URL is built from this request's Host.

type IdParams = { id: string };

function readInput(body: Record<string, unknown>): ArrServerInput {
  const parsed = parseArrServerInput(body);
  if (!parsed.ok) throw invalid(parsed.error);
  return parsed.input;
}

export const listArrServersHandler = withApi(async (request): Promise<{ results: ArrServerDto[] }> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const base = webhookBaseUrl(request.headers);
  const servers = await listArrServers(ctx.user.id);
  return { results: servers.map((s) => toArrServerDto(s, base)) };
});

export const createArrServerHandler = withApi(async (request) => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const body = await readJsonBody(request);
  const kind = parseArrKind(body.kind);
  if (!kind) throw invalid('"kind" must be sonarr or radarr.');
  const { server } = unwrap(await createArrServer(ctx.user.id, kind, readInput(body)));
  return apiJson({ ok: true, server: toArrServerDto(server, webhookBaseUrl(request.headers)) }, { status: 201 });
});

export const testArrServerHandler = withApi(
  async (request): Promise<ArrPickerOptions & { ok: true; version: string | null }> => {
    const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    const body = await readJsonBody(request);
    const input = readInput(body);
    if (body.serverId !== undefined && typeof body.serverId !== "string") {
      throw invalid('"serverId" must be a string.');
    }
    const result = unwrap(
      await testArrServerConnection(ctx.user.id, {
        kind: body.kind,
        serverId: body.serverId,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
      }),
    );
    return {
      ok: true,
      version: result.version,
      qualityProfiles: result.qualityProfiles,
      rootFolders: result.rootFolders,
      tags: result.tags,
    };
  },
);

export const updateArrServerHandler = withApi<IdParams>(
  async (request, params): Promise<{ ok: true; server: ArrServerDto }> => {
    const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    const id = parseUuidSegment(params.id, SERVER_NOT_FOUND);
    const body = await readJsonBody(request);
    const { server } = unwrap(await updateArrServer(ctx.user.id, id, readInput(body)));
    return { ok: true, server: toArrServerDto(server, webhookBaseUrl(request.headers)) };
  },
);

export const deleteArrServerHandler = withApi<IdParams>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const id = parseUuidSegment(params.id, SERVER_NOT_FOUND);
  unwrap(await deleteArrServer(ctx.user.id, id));
  return { ok: true };
});

export const arrServerOptionsHandler = withApi<IdParams>(async (request, params): Promise<ArrPickerOptions> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const id = parseUuidSegment(params.id, SERVER_NOT_FOUND);
  const { qualityProfiles, rootFolders, tags } = unwrap(await getArrServerOptions(ctx.user.id, id));
  return { qualityProfiles, rootFolders, tags };
});

export const regenerateArrServerSecretHandler = withApi<IdParams>(
  async (request, params): Promise<{ ok: true; webhookUrl: string }> => {
    const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    const id = parseUuidSegment(params.id, SERVER_NOT_FOUND);
    const { server } = unwrap(await regenerateArrServerSecret(ctx.user.id, id));
    return { ok: true, webhookUrl: toArrServerDto(server, webhookBaseUrl(request.headers)).webhookUrl };
  },
);
