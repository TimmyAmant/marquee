// The pure half of "Share with a household member" (lib/sharing/index.ts):
// checking who it goes to and cleaning the note, plus the outside links the
// share sheets offer. No database imports, so the rules are unit tested
// directly and the website's client code can use the link builders.

import type { MediaType } from "@/lib/db/schema";

/** A note's longest, in characters (an emoji counts once). */
export const MAX_SHARE_NOTE = 280;
/** People one share can go to at once. */
export const MAX_SHARE_RECIPIENTS = 20;
/** Notifications one person may send by sharing in an hour: a share to three
 * people counts three. */
export const SHARES_PER_HOUR = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The account a shared-title notification came from (users row fields). */
export type NotificationSender = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUpdatedAt: Date | null;
};

type Parsed<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Who a share goes to: a non-empty list of account ids, without the
 * sender, at most MAX_SHARE_RECIPIENTS, repeats dropped. Whether each is a
 * real account is the caller's check. */
export function parseRecipients(raw: unknown, senderId: string): Parsed<{ userIds: string[] }> {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Pick who to share it with." };
  if (!raw.every((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))) {
    return { ok: false, error: "Pick who to share it with." };
  }
  const userIds = [...new Set(raw.map((id) => id.toLowerCase()))];
  if (userIds.includes(senderId.toLowerCase())) return { ok: false, error: "You can't share with yourself." };
  if (userIds.length > MAX_SHARE_RECIPIENTS) {
    return { ok: false, error: `Share with at most ${MAX_SHARE_RECIPIENTS} people at a time.` };
  }
  return { ok: true, userIds };
}

// Things a note never needs and that could make it display as something it
// isn't: C0/C1 controls (line breaks become spaces first), bidirectional
// overrides and isolates, and zero-width characters other than the joiner
// that holds emoji sequences together.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
// Markup-looking tags ("<b>", "</a>", "<img src=x>"), not a lone "<" or "a < b".
const TAG = /<\/?[a-z][^<>]*>/gi;

/** The note as plain text on one line: tags and invisible characters out,
 * runs of whitespace (line breaks included) to one space. Null when that
 * leaves nothing; an error past MAX_SHARE_NOTE characters. */
export function cleanShareNote(raw: unknown): Parsed<{ note: string | null }> {
  if (raw === undefined || raw === null) return { ok: true, note: null };
  if (typeof raw !== "string") return { ok: false, error: "The note has to be text." };
  const note = raw
    .normalize("NFC")
    .replace(TAG, "")
    .replace(/[\t\n\r\u2028\u2029]/g, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!note) return { ok: true, note: null };
  if (Array.from(note).length > MAX_SHARE_NOTE) {
    return { ok: false, error: `Keep the note under ${MAX_SHARE_NOTE} characters.` };
  }
  return { ok: true, note };
}

/** What the recipient reads: `Susan shared “Ice Age” with you: <note>`. */
export function shareMessage(senderLabel: string, title: string, note: string | null): string {
  const base = `${senderLabel} shared “${title}” with you`;
  return note ? `${base}: ${note}` : base;
}

/** The Marquee page for a title or person under `base` (the public address,
 * else wherever the viewer has Marquee open). */
export function marqueeUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

/** The title's public pages, for people who can't sign in to Marquee. */
export function publicTitleLinks(mediaType: MediaType, tmdbId: number, imdbId: string | null) {
  return {
    tmdb: `https://www.themoviedb.org/${mediaType}/${tmdbId}`,
    imdb: imdbId && /^tt\d+$/.test(imdbId) ? `https://www.imdb.com/title/${imdbId}/` : null,
  };
}

/** The share sheet's fallback targets when the browser has no Web Share. */
export function outsideShareTargets(text: string, url: string) {
  const body = `${text} ${url}`;
  return {
    // `sms:?&body=` is the form both iOS and Android read.
    sms: `sms:?&body=${encodeURIComponent(body)}`,
    email: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(body)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(body)}`,
    messenger: `fb-messenger://share/?link=${encodeURIComponent(url)}`,
  };
}
