import { z } from "zod";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

// The username/password/display-name rules every account form shares (first
// run setup, adding and editing household members). Their messages are
// message keys (lib/i18n), turned into words by firstIssueMessage.

export const usernameSchema = z
  .string()
  .min(3, "server.usernameTooShort" satisfies MessageKey)
  .max(32, "server.usernameTooLong" satisfies MessageKey)
  .regex(/^[a-zA-Z0-9_.-]+$/, "server.usernameChars" satisfies MessageKey);

export const passwordSchema = z.string().min(8, "server.passwordTooShort" satisfies MessageKey);

export const displayNameSchema = z
  .string()
  .min(1, "server.displayNameEmpty" satisfies MessageKey)
  .max(80, "server.displayNameTooLong" satisfies MessageKey);

/** The first problem zod found, in `t`'s language — "Invalid input" for
 * one without a message of ours (a wrong type, say). */
export function firstIssueMessage(error: z.ZodError, t: Translator): string {
  const message = error.issues[0]?.message;
  return message?.startsWith("server.") ? t(message as MessageKey) : t("server.invalidInput");
}
