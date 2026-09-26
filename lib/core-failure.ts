import { fail, type CoreErrorCode, type CoreFailure } from "@/lib/core-result";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, MessageValues } from "@/lib/i18n/translator";

/**
 * `fail()` with its message in the language of whoever the request is for
 * (lib/i18n/server.ts getT: the account's choice, else Accept-Language, else
 * English — always English in a job or a test). For shared-core code that
 * both a server action and an /api/v1 handler call:
 * `return failT("not_found", "server.accountNotFound")`.
 */
export async function failT(code: CoreErrorCode, key: MessageKey, values?: MessageValues): Promise<CoreFailure> {
  return fail(code, (await getT())(key, values));
}
