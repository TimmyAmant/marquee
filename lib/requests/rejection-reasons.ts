// Why a request was declined. Pure (no DB imports) so it can be unit tested
// and shared with /api/v1/requests: the web's Reject chooser and native
// clients both offer REJECTION_REASON_PRESETS, and whatever text the admin
// ends up sending goes through the same normalization before it's stored.

export const REJECTION_REASON_MAX_LENGTH = 200;

export const REJECTION_REASON_PRESETS: readonly string[] = [
  "Already available on a streaming service we have",
  "Not released yet, ask again once it's out",
  "Not enough space on the server right now",
  "Not a fit for the household library",
  "Couldn't find a good copy of it",
];

/** The chooser's free-text choice. Only a UI label: what gets stored is the
 * admin's own words, never this word itself. */
export const CUSTOM_REJECTION_REASON = "Other";

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

/** The web form's two inputs (the preset radio and the "Other" text box)
 * resolved into the one reason to store. No preset at all is allowed and
 * means no reason: the column is optional at the data layer so older API
 * clients that send nothing keep working. */
export function resolveRejectionReason(input: { preset?: unknown; custom?: unknown }): ResolvedRejectionReason {
  const preset = typeof input.preset === "string" ? input.preset.trim() : "";
  if (!preset) return { ok: true, reason: null };
  if (REJECTION_REASON_PRESETS.includes(preset)) return { ok: true, reason: preset };
  if (preset === CUSTOM_REJECTION_REASON) {
    const reason = normalizeRejectionReason(input.custom);
    if (!reason) return { ok: false, error: "Add a short reason, or pick one from the list." };
    return { ok: true, reason };
  }
  return { ok: false, error: "Pick a reason from the list." };
}
