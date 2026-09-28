/**
 * Which edge of the window the navigation rail (components/nav-menu.tsx)
 * sits on, from Settings › Account › Appearance. A per-device preference,
 * kept in a cookie so the root layout renders it on the server as
 * data-rail on <html> and the page never paints with the rail in the wrong
 * place. Everything that depends on it (the rail's own layout, the content
 * offset, popovers) keys off that attribute in CSS — see the rail-*
 * variants in app/globals.css. Phone-sized windows use the tab bar along the
 * bottom whatever this says (components/phone-tab-bar.tsx).
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

/**
 * "Show menu labels" (Settings › Account › Appearance), also per device:
 * the rail widens to show each section's name beside its icon (a top or
 * bottom bar lays them out inline) and the server's version sits at the
 * end of it. Rendered as data-rail-labels="on" on <html>, like data-rail.
 */
export const RAIL_LABELS_COOKIE = "marquee-rail-labels";

export function parseRailLabels(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "on";
}

export function railLabelsCookie(on: boolean): string {
  return `${RAIL_LABELS_COOKIE}=${on ? "on" : "off"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** A rail item's classes with menu labels on (the rail-labeled variant in
 * app/globals.css): the full width of the rail, its name after the icon. */
export const RAIL_LABELED_ITEM =
  "lg:rail-labeled:w-full lg:rail-labeled:justify-start lg:rail-labeled:gap-3 lg:rail-labeled:px-[10.5px]";
