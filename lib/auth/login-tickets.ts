import { randomBytes } from "crypto";

// Short-lived, single-use secrets that stand between "the server verified
// this person with Plex/Jellyfin" and "the browser gets a session": the
// server issues a login ticket for the account, and the `media-server`
// credentials provider in auth.ts trades it for the session cookie. The
// ticket never leaves the server — the web sign-in issues and redeems it in
// one server action — but it's built as if it might: 256 random bits,
// 2 minutes to live, gone the moment it's used.
//
// Also the in-memory home of Plex PIN handles, for the same reason as the
// rate-limit buckets (lib/rate-limit.ts): on globalThis, since Next.js can
// load a module more than once in one process, and a PIN started by one
// route must be found by the next. Single-container deployment is assumed
// throughout; a restart just means starting the sign-in again.

export const LOGIN_TICKET_TTL_MS = 2 * 60 * 1000;
export const PLEX_PIN_TTL_MS = 10 * 60 * 1000;

type Ticket = { userId: string; expiresAt: number };

/** What a Plex PIN handle stands for. `purpose` binds it to the flow that
 * started it: a sign-in handle can't be used to link an account, and a link
 * handle belongs to the one account that started it. */
export type PlexPinEntry = {
  pinId: number;
  clientId: string;
  purpose: { kind: "sign_in" } | { kind: "link"; userId: string };
  expiresAt: number;
  /** When plex.tv was last asked about this PIN (see shouldCheckPin). */
  lastCheckedAt: number;
};

declare global {
  var __marqueeLoginTickets: Map<string, Ticket> | undefined;
  var __marqueePlexPins: Map<string, PlexPinEntry> | undefined;
  var __marqueeLoginTicketSweeper: boolean | undefined;
}

const tickets: Map<string, Ticket> = (globalThis.__marqueeLoginTickets ??= new Map());
const pins: Map<string, PlexPinEntry> = (globalThis.__marqueePlexPins ??= new Map());

if (!globalThis.__marqueeLoginTicketSweeper) {
  globalThis.__marqueeLoginTicketSweeper = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, ticket] of tickets) if (now > ticket.expiresAt) tickets.delete(key);
    for (const [key, pin] of pins) if (now > pin.expiresAt) pins.delete(key);
  }, 60 * 1000).unref?.();
}

function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function issueLoginTicket(userId: string, now = Date.now()): string {
  const ticket = randomSecret();
  tickets.set(ticket, { userId, expiresAt: now + LOGIN_TICKET_TTL_MS });
  return ticket;
}

/** The account a ticket was issued for, or null when it's unknown, used or
 * expired. The lookup and the delete happen in one synchronous step, so two
 * requests racing with the same ticket can't both get it. */
export function consumeLoginTicket(ticket: unknown, now = Date.now()): string | null {
  if (typeof ticket !== "string" || !ticket) return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  return now > entry.expiresAt ? null : entry.userId;
}

export function createPlexPinHandle(
  entry: Omit<PlexPinEntry, "expiresAt" | "lastCheckedAt">,
  now = Date.now(),
): { handle: string; expiresAt: number } {
  const handle = randomSecret();
  const expiresAt = now + PLEX_PIN_TTL_MS;
  pins.set(handle, { ...entry, expiresAt, lastCheckedAt: 0 });
  return { handle, expiresAt };
}

export type PinLookup = { status: "ok"; entry: PlexPinEntry } | { status: "expired" };

/** A live handle for this purpose. A handle that's unknown, expired, or
 * was started for something else (another account's link, or a link
 * rather than a sign-in) all answer "expired": nothing about someone else's
 * sign-in is given away, and the client's next step is the same either
 * way — start again. */
export function getPlexPin(handle: unknown, purpose: PlexPinEntry["purpose"], now = Date.now()): PinLookup {
  if (typeof handle !== "string" || !handle) return { status: "expired" };
  const entry = pins.get(handle);
  if (!entry) return { status: "expired" };
  if (now > entry.expiresAt) {
    pins.delete(handle);
    return { status: "expired" };
  }
  const samePurpose =
    entry.purpose.kind === purpose.kind &&
    (entry.purpose.kind !== "link" || (purpose.kind === "link" && entry.purpose.userId === purpose.userId));
  return samePurpose ? { status: "ok", entry } : { status: "expired" };
}

/** Minimum time between plex.tv checks of one PIN. Clients poll every 2 s;
 * anything faster answers "pending" without bothering plex.tv. */
export const PIN_CHECK_SPACING_MS = 1000;

/** Books a plex.tv check of this PIN now, unless one happened too recently. */
export function shouldCheckPin(entry: PlexPinEntry, now = Date.now()): boolean {
  if (now - entry.lastCheckedAt < PIN_CHECK_SPACING_MS) return false;
  entry.lastCheckedAt = now;
  return true;
}

/** Takes the handle out of play once its PIN has been authorized, so the
 * Plex token behind it is used exactly once. True for the caller that got
 * it; a concurrent poll that lost the race gets false. */
export function claimPlexPin(handle: string): boolean {
  return pins.delete(handle);
}
