import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { blocklistEntryDto } from "@/lib/api/mappers";
import { blockByRule, listBlocklist, parseBlockRule } from "@/lib/requests/blocklist";
import type { BlocklistEntry, ListResponse, Ok } from "@/lib/api/types";

const FORBIDDEN = msg("server.onlyAdminBlocklist");

/** Everything nobody may request: keywords first, then titles. */
export const GET = withApi(async (request): Promise<ListResponse<BlocklistEntry>> => {
  await requireApiPermission(request, "manageBlocklist", FORBIDDEN);
  return { results: (await listBlocklist()).map(blocklistEntryDto) };
});

/** Blocks automatically: a TMDb keyword or genre (`{ "keyword": "anime" }`,
 * or `"kind": "keyword"`), a rating in a country (`{ "kind":
 * "certification", "region": "US", "certification": "NC-17" }`) or
 * everything TMDb marks adult (`{ "kind": "adult" }`), each with an optional
 * `reason`. */
export const POST = withApi(async (request): Promise<Ok> => {
  await requireApiPermission(request, "manageBlocklist", FORBIDDEN);
  const body = await readJsonBody(request);
  const { rule } = unwrap(await parseBlockRule(body));
  unwrap(await blockByRule(rule, body.reason));
  return { ok: true };
});
