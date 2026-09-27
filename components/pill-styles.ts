// The title page's action capsules (components/title-hero.tsx): every pill in
// that row is 32px tall, 13px text, centred on the same line, so the status
// badge, Add / Request, Play, Report, Share and the "…" menu line up whatever
// wraps. The "…" menu's rows use MENU_ITEM.

export const PILL =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] leading-none transition-colors disabled:opacity-60";

/** A faint frosted fill under the outlined capsules, so they still read
 * where the hero's artwork is bright behind them. */
const GLASS = "bg-bg-0/40 backdrop-blur-md";

/** Secondary actions: a hairline capsule. */
export const PILL_OUTLINE = `${PILL} ${GLASS} border border-border-strong text-text-primary hover:border-accent hover:text-accent`;

/** The primary action (Add, Request). */
export const PILL_ACCENT = `${PILL} bg-accent px-4 font-semibold text-bg-0 hover:bg-accent-hover`;

/** A read-only state capsule ("Problem reported", "Requests closed"). */
export const PILL_NOTE = `${PILL} ${GLASS} border border-border text-text-secondary`;

/** One row of the title page's "…" menu (components/title-more-menu.tsx). */
export const MENU_ITEM =
  "flex min-h-8 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-text-primary transition-colors hover:bg-text-primary/10 disabled:opacity-60";
