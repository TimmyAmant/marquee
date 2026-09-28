// Marquee version numbers ("0.45.3", "v0.45.3"), for the "What's new"
// pop-up (lib/whats-new.ts) and Settings › About's update line
// (lib/updates/latest-release.ts). Pure, so both the browser and the server
// use it.

/**
 * A dotted version ("0.45.3", "v0.45.3") as numbers, most significant first.
 * A pre-release suffix ("-beta.1") or build metadata ("+abc") is ignored.
 * Null for anything else.
 */
export function parseVersion(text: string | null | undefined): number[] | null {
  if (typeof text !== "string") return null;
  let trimmed = text.trim();
  if (trimmed.startsWith("v") || trimmed.startsWith("V")) trimmed = trimmed.slice(1);
  const core = trimmed.split(/[-+]/, 1)[0];
  const parts = core.split(".");
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map((part) => Number(part));
}

/** Part by part, a missing part counting as 0: -1, 0 or 1. Unparseable sorts first. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return a ? 1 : b ? -1 : 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
