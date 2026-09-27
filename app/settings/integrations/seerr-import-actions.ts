"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getT } from "@/lib/i18n/server";
import {
  getSeerrImportJob,
  previewSeerrImport,
  startSeerrImport,
  testSeerrConnection,
  type SeerrImportChoices,
  type SeerrImportJob,
  type SeerrImportPreview,
  type SeerrServerInfo,
} from "@/lib/import/seerr/import";

// The website's side of "Import from Seerr" — thin admin-only wrappers
// around lib/import/seerr, which /api/v1/settings/import/seerr shares. The
// address and key travel with each call and are never stored.

async function admin() {
  return requireAdmin((await getT())("integrations.seerrAdminOnly"));
}

export async function testSeerrAction(url: string, apiKey: string): Promise<{ server?: SeerrServerInfo; error?: string }> {
  const who = await admin();
  if (!who.ok) return { error: who.error };
  const result = await testSeerrConnection({ url, apiKey });
  return result.ok ? { server: result.server } : { error: result.error };
}

export async function previewSeerrAction(url: string, apiKey: string): Promise<{ preview?: SeerrImportPreview; error?: string }> {
  const who = await admin();
  if (!who.ok) return { error: who.error };
  const result = await previewSeerrImport(who.userId, { url, apiKey });
  return result.ok ? { preview: result.preview } : { error: result.error };
}

export async function startSeerrImportAction(
  url: string,
  apiKey: string,
  choices: SeerrImportChoices,
): Promise<{ job?: SeerrImportJob; error?: string }> {
  const who = await admin();
  if (!who.ok) return { error: who.error };
  const safe: SeerrImportChoices = {
    users: choices.users === true,
    updateExistingUsers: choices.updateExistingUsers === true,
    requests: choices.requests === true,
    issues: choices.issues === true,
    blocklist: choices.blocklist === true,
  };
  const result = await startSeerrImport(who.userId, { url, apiKey }, safe);
  return result.ok ? { job: result.job } : { error: result.error };
}

export async function seerrImportJobAction(jobId: string): Promise<{ job?: SeerrImportJob; error?: string }> {
  const who = await admin();
  if (!who.ok) return { error: who.error };
  const job = getSeerrImportJob(jobId);
  return job ? { job } : { error: (await getT())("server.seerrImportNotFound") };
}
