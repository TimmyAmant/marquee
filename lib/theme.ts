export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "marquee-theme";

/** Saved preference wins; otherwise follow the OS. Shared logic between the
 * inline script string below and resolveTheme() so the two can't drift. */
function resolveThemeFrom(saved: string | null, prefersLight: boolean): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return prefersLight ? "light" : "dark";
}

/** React-side counterpart to THEME_INIT_SCRIPT, used as a belt-and-suspenders
 * re-apply on mount (see components/theme-sync.tsx) — the inline script
 * only runs on a true full document load, not on every client-side
 * transition, and (per browser spec) a <script> re-created via innerHTML
 * during a React hydration-mismatch recovery silently never executes at
 * all, so this exists to reach the same end state even if that happens. */
export function resolveTheme(): Theme {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_STORAGE_KEY) : null;
  const prefersLight =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches;
  return resolveThemeFrom(saved, prefersLight);
}

/** Inline script (plain JS string, not importable) that sets data-theme
 * before first paint on a true full page load — see app/layout.tsx. Kept
 * logically identical to resolveTheme() above. */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = saved === "light" || saved === "dark"
      ? saved
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;
