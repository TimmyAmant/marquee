import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { deleteOverrideRule, parseOverrideRuleInput, updateOverrideRule } from "@/lib/arr/override-rules-server";
import type { OverrideRule } from "@/lib/arr/override-rules";
import type { Ok } from "@/lib/api/types";

type Params = { id: string };

/** Replace a rule (the same body as adding one). */
export const PUT = withApi<Params>(async (request, params): Promise<{ ok: true; rule: OverrideRule }> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const { input } = unwrap(await parseOverrideRuleInput(await readJsonBody(request)));
  const { rule } = unwrap(await updateOverrideRule(ctx.user.id, params.id, input));
  return { ok: true, rule };
});

export const DELETE = withApi<Params>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  unwrap(await deleteOverrideRule(ctx.user.id, params.id));
  return { ok: true };
});
