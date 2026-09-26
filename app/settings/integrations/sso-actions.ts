"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  removeSsoSettings,
  testAndSaveSsoSettings,
  testSsoIssuer,
  type SsoSettingsView,
  type SsoTestResult,
} from "@/lib/auth/sso/config";

// Settings → Integrations' single sign-on card (admin) — the same operations
// as /api/v1/settings/sso (lib/auth/sso/config.ts).

const FORBIDDEN = "Only the admin can change sign-in settings.";

export type SsoSaveState = { error?: string; success?: boolean; settings?: SsoSettingsView };

export async function saveSsoSettingsAction(_prev: SsoSaveState | undefined, formData: FormData): Promise<SsoSaveState> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { error: admin.error };
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const result = await testAndSaveSsoSettings({
    name: text("name"),
    issuer: text("issuer"),
    clientId: text("clientId"),
    clientSecret: text("clientSecret"),
    clearClientSecret: formData.get("clearClientSecret") === "on",
    scopes: text("scopes"),
    publicUrl: text("publicUrl"),
    allowSignup: formData.get("allowSignup") === "on",
    matchEmail: formData.get("matchEmail") === "on",
    requiredGroup: text("requiredGroup"),
    trustedGroup: text("trustedGroup"),
    groupsClaim: text("groupsClaim"),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings", "layout");
  return { success: true, settings: result.settings };
}

export async function testSsoIssuerAction(issuer: string): Promise<{ result?: SsoTestResult; error?: string }> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { error: admin.error };
  const tested = await testSsoIssuer(issuer);
  return tested.ok ? { result: tested.result } : { error: tested.error };
}

export async function removeSsoSettingsAction(): Promise<{ error?: string; success?: boolean }> {
  const admin = await requireAdmin(FORBIDDEN);
  if (!admin.ok) return { error: admin.error };
  await removeSsoSettings();
  revalidatePath("/settings", "layout");
  return { success: true };
}
