import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { blocklistEntryDto } from "@/lib/api/mappers";
import { blockKeyword, listBlocklist } from "@/lib/requests/blocklist";
import type { BlocklistEntry, ListResponse, Ok } from "@/lib/api/types";

const FORBIDDEN = msg("server.onlyAdminBlocklist");

/** Everything nobody may request: keywords first, then titles. */
export const GET = withApi(async (request): Promise<ListResponse<BlocklistEntry>> => {
  await requireApiPermission(request, "manageBlocklist", FORBIDDEN);
  return { results: (await listBlocklist()).map(blocklistEntryDto) };
});

/** Blocks a TMDb keyword or genre: `{ "keyword": "anime", "reason": "…" }`. */
export const POST = withApi(async (request): Promise<Ok> => {
  await requireApiPermission(request, "manageBlocklist", FORBIDDEN);
  const body = await readJsonBody(request);
  unwrap(await blockKeyword(body.keyword, body.reason));
  return { ok: true };
});
