/**
 * Which edge of the window the navigation rail (components/nav-menu.tsx)
 * sits on, from Settings › Account › Appearance. A per-device preference,
 * kept in a cookie so the root layout renders it on the server as
 * data-rail on <html> and the page never paints with the rail in the wrong
 * place. Everything that depends on it (the rail's own layout, the content
 * offset, popovers) keys off that attribute in CSS — see the rail-*
 * variants in app/globals.css. Narrow screens use the drawer whatever this
 * says.
 */
export const RAIL_POSITIONS = ["left", "right", "top", "bottom"] as const;

export type RailPosition = (typeof RAIL_POSITIONS)[number];

export const RAIL_COOKIE = "marquee-rail";

export const DEFAULT_RAIL_POSITION: RailPosition = "left";

/** The cookie's value as a position; anything missing or unrecognised is
 * the default, so a stale or hand-edited cookie can't break the layout. */
export function parseRailPosition(value: string | null | undefined): RailPosition {
  const normalized = value?.trim().toLowerCase();
  return (RAIL_POSITIONS as readonly string[]).includes(normalized ?? "")
    ? (normalized as RailPosition)
    : DEFAULT_RAIL_POSITION;
}

/** A document.cookie assignment that keeps the choice for a year. */
export function railPositionCookie(position: RailPosition): string {
  return `${RAIL_COOKIE}=${position}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
