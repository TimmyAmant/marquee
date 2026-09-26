// Why a request was declined. Pure (no DB imports) so it can be unit tested
// and shared with /api/v1/requests: the web's Reject chooser and native
// clients both offer the presets, and whatever text the admin ends up
// sending goes through the same normalization before it's stored.
//
// The web chooser posts a preset's stable code (REJECTION_REASON_CODES);
// what's stored is that preset's text in the reviewer's language — the
// column is free text shared with custom reasons and with the apps, which
// post text. Where it's shown, localizeRejectionReason turns a stored
// preset back into the viewer's language, whichever language it was
// stored in.
import type { MessageKey, Translator } from "@/lib/i18n/translator";

export const REJECTION_REASON_MAX_LENGTH = 200;

export const REJECTION_REASON_CODES = ["streaming", "unreleased", "no_space", "not_a_fit", "no_good_copy"] as const;
export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

const REJECTION_REASON_KEYS: Record<RejectionReasonCode, MessageKey> = {
  streaming: "requests.reasonStreaming",
  unreleased: "requests.reasonUnreleased",
  no_space: "requests.reasonNoSpace",
  not_a_fit: "requests.reasonNotAFit",
  no_good_copy: "requests.reasonNoGoodCopy",
};

/** A preset's text in `t`'s language. */
export function rejectionReasonText(t: Translator, code: RejectionReasonCode): string {
  return t(REJECTION_REASON_KEYS[code]);
}

/** Every preset's text, in the chooser's order — what the apps are offered. */
export function rejectionReasonPresets(t: Translator): string[] {
  return REJECTION_REASON_CODES.map((code) => rejectionReasonText(t, code));
}

/** The chooser's free-text choice: the code it posts. Its label is
 * requests.reasonOther; what gets stored is the admin's own words, never
 * this code or that label. */
export const CUSTOM_REJECTION_REASON = "other";

function isPresetCode(value: string): value is RejectionReasonCode {
  return (REJECTION_REASON_CODES as readonly string[]).includes(value);
}

/** A stored reason for display: when it's one of the presets in any of
 * `translators`' languages (the English of older rows included), that
 * preset in `t`'s language; anything else — the admin's own words — as it
 * is. */
export function localizeRejectionReason(t: Translator, stored: string, translators: readonly Translator[]): string {
  for (const code of REJECTION_REASON_CODES) {
    if (translators.some((other) => rejectionReasonText(other, code) === stored)) return rejectionReasonText(t, code);
  }
  return stored;
}

/** Trims, collapses internal runs of whitespace (a pasted newline shouldn't
 * become a line break inside a notification) and caps the length. The cap
 * counts code points rather than UTF-16 units (String.prototype.slice would
 * split an emoji sitting on the boundary and leave a lone surrogate, which
 * the Postgres driver stores as U+FFFD), so the Mac app's scalar-based cap
 * lands on the same text. Anything that isn't a string, or is blank once
 * trimmed, becomes null so "no reason" is one value everywhere. */
export function normalizeRejectionReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return Array.from(collapsed).slice(0, REJECTION_REASON_MAX_LENGTH).join("").trimEnd();
}

export type ResolvedRejectionReason = { ok: true; reason: string | null } | { ok: false; error: string };

/** The web form's two inputs (the preset radio's code and the "Other" text
 * box) resolved into the one reason to store, a preset as its text in `t`'s
 * language (errors are in it too). No preset at all is allowed and means no
 * reason: the column is optional at the data layer so older API clients
 * that send nothing keep working. */
export function resolveRejectionReason(
  t: Translator,
  input: { preset?: unknown; custom?: unknown },
): ResolvedRejectionReason {
  const preset = typeof input.preset === "string" ? input.preset.trim() : "";
  if (!preset) return { ok: true, reason: null };
  if (isPresetCode(preset)) return { ok: true, reason: rejectionReasonText(t, preset) };
  if (preset === CUSTOM_REJECTION_REASON) {
    const reason = normalizeRejectionReason(input.custom);
    if (!reason) return { ok: false, error: t("requests.reasonCustomRequired") };
    return { ok: true, reason };
  }
  return { ok: false, error: t("requests.reasonPickFromList") };
}
