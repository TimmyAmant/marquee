"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False while the server renders and while the browser hydrates that HTML,
 * true on every render after: what a Client Component uses to show a time
 * that depends on the viewer's clock or time zone without a hydration
 * mismatch. The server and the hydrating browser both render the stable
 * version (a time in UTC, a plain date); React then renders again at once
 * with the viewer's own.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * The time zone to format a moment in (lib/i18n/format.ts's `timeZone`):
 * UTC while hydrating, so the browser's first render matches the server's
 * HTML, then the viewer's own (undefined).
 */
export function useDisplayTimeZone(): string | undefined {
  return useHydrated() ? undefined : "UTC";
}
