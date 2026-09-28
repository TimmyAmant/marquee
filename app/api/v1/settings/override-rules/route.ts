import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { apiJson } from "@/lib/api/errors";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { createOverrideRule, listOverrideRules, parseOverrideRuleInput } from "@/lib/arr/override-rules-server";
import type { OverrideRule } from "@/lib/arr/override-rules";
import type { ListResponse } from "@/lib/api/types";

/** Settings › Services › Override rules (admin): every rule, in order. */
export const GET = withApi(async (request): Promise<ListResponse<OverrideRule>> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  return { results: await listOverrideRules(ctx.user.id) };
});

/** Add a rule; it goes after the others. */
export const POST = withApi(async (request) => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const { input } = unwrap(await parseOverrideRuleInput(await readJsonBody(request)));
  const { rule } = unwrap(await createOverrideRule(ctx.user.id, input));
  return apiJson({ ok: true, rule }, { status: 201 });
});
