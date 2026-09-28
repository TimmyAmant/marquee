import "server-only";

// Settings › About's update line: the newest Marquee release on GitHub,
// the same one the Mac and Windows apps check (their Updater). Asked at
// most every few hours per server process, and never in the way — no
// answer within a few seconds, or any failure, just means "unknown".

const RELEASES_URL = "https://api.github.com/repos/TimmyAmant/marquee/releases/latest";
const CACHE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

let cached: { at: number; version: string | null } | null = null;

/** "v0.54.1" or "0.54.1" → [0, 54, 1]; anything else → null. */
export function parseVersion(value: string | null | undefined): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value?.trim() ?? "");
  return match ? match.slice(1, 4).map(Number) : null;
}

/** Negative when a is older than b, 0 when the same, positive when newer.
 * Null when either isn't a version. */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export type UpdateStatus =
  | { kind: "unknown" }
  | { kind: "current"; latest: string }
  | { kind: "available"; latest: string };

export function updateStatus(running: string, latest: string | null): UpdateStatus {
  if (!latest) return { kind: "unknown" };
  const order = compareVersions(running, latest);
  if (order === null) return { kind: "unknown" };
  const bare = latest.replace(/^v/, "");
  return order < 0 ? { kind: "available", latest: bare } : { kind: "current", latest: bare };
}

/** The newest release's version ("0.54.1"), or null when GitHub can't say. */
export async function latestReleaseVersion(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.version;
  let version: string | null = null;
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { tag_name?: unknown };
      version = typeof body.tag_name === "string" && parseVersion(body.tag_name) ? body.tag_name.replace(/^v/, "") : null;
    }
  } catch {
    version = null;
  }
  cached = { at: Date.now(), version };
  return version;
}
