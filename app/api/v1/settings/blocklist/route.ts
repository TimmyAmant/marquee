import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { blocklistEntryDto } from "@/lib/api/mappers";
import { blockKeyword, listBlocklist } from "@/lib/requests/blocklist";
import type { BlocklistEntry, ListResponse, Ok } from "@/lib/api/types";

const FORBIDDEN = "Only the admin can manage the blocklist.";

/** Everything nobody may request: keywords first, then titles. */
export const GET = withApi(async (request): Promise<ListResponse<BlocklistEntry>> => {
  await requireApiAdmin(request, FORBIDDEN);
  return { results: (await listBlocklist()).map(blocklistEntryDto) };
});

/** Blocks a TMDb keyword or genre: `{ "keyword": "anime", "reason": "…" }`. */
export const POST = withApi(async (request): Promise<Ok> => {
  await requireApiAdmin(request, FORBIDDEN);
  const body = await readJsonBody(request);
  unwrap(await blockKeyword(body.keyword, body.reason));
  return { ok: true };
});
