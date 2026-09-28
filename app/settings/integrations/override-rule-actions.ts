"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createOverrideRule,
  deleteOverrideRule,
  parseOverrideRuleInput,
  updateOverrideRule,
} from "@/lib/arr/override-rules-server";
import { lookUpShelfSource } from "@/lib/discover/lookup";
import { getT } from "@/lib/i18n/server";

// Settings › Services › Override rules (components/override-rules-card.tsx):
// thin session wrappers over lib/arr/override-rules-server.ts, shared with
// /api/v1/settings/override-rules. Everything is checked again by the API's
// own parser.

export type OverrideRuleActionResult = { ok: true } | { ok: false; error: string };

async function admin() {
  return requireAdmin((await getT())("integrations.adminOnly"));
}

/** Add (id null) or replace a rule. */
export async function saveOverrideRuleAction(id: string | null, body: Record<string, unknown>): Promise<OverrideRuleActionResult> {
  const who = await admin();
  if (!who.ok) return { ok: false, error: who.error };
  const parsed = await parseOverrideRuleInput(body && typeof body === "object" ? body : {});
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const result = id === null ? await createOverrideRule(who.userId, parsed.input) : await updateOverrideRule(who.userId, id, parsed.input);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/settings/services");
  return { ok: true };
}

export async function deleteOverrideRuleAction(id: string): Promise<OverrideRuleActionResult> {
  const who = await admin();
  if (!who.ok) return { ok: false, error: who.error };
  const result = await deleteOverrideRule(who.userId, id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/settings/services");
  return { ok: true };
}

/** TMDb keywords by name, for a rule's Keywords. */
export async function searchRuleKeywordsAction(query: string): Promise<{ id: number; name: string }[]> {
  const who = await admin();
  if (!who.ok) return [];
  const result = await lookUpShelfSource("keyword", typeof query === "string" ? query : "", null).catch(() => null);
  return result?.ok ? result.results.map((r) => ({ id: r.tmdbId, name: r.name })) : [];
}
